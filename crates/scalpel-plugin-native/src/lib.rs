use prost::Message;
use std::io::{self, Read, Write};

mod generated {
    include!(concat!(env!("OUT_DIR"), "/scalpel_plugin_native.rs"));
}

use generated::scalpel::plugin::native::v1::{
    CallError, CallResponse, InitializeResponse, NativeFrame, native_frame::Body,
};

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_FRAME_BYTES: usize = 1024 * 1024;

pub struct BackendIdentity<'a> {
    pub plugin_id: &'a str,
    pub service: &'a str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendError {
    pub code: String,
    pub message: String,
}

impl BackendError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

pub fn serve_stdio<F>(identity: BackendIdentity<'_>, dispatch: F) -> io::Result<()>
where
    F: FnMut(&str, &[u8]) -> Result<Vec<u8>, BackendError>,
{
    let stdin = io::stdin();
    let stdout = io::stdout();
    serve(identity, stdin.lock(), stdout.lock(), dispatch)
}

pub fn serve<R, W, F>(
    identity: BackendIdentity<'_>,
    mut reader: R,
    mut writer: W,
    mut dispatch: F,
) -> io::Result<()>
where
    R: Read,
    W: Write,
    F: FnMut(&str, &[u8]) -> Result<Vec<u8>, BackendError>,
{
    let Some(frame) = read_frame(&mut reader)? else {
        return Ok(());
    };
    let initialized = match frame.body {
        Some(Body::InitializeRequest(request))
            if request.protocol_version == PROTOCOL_VERSION
                && request.plugin_id == identity.plugin_id
                && request.service == identity.service =>
        {
            write_frame(
                &mut writer,
                &NativeFrame {
                    request_id: frame.request_id,
                    body: Some(Body::InitializeResponse(InitializeResponse {
                        protocol_version: PROTOCOL_VERSION,
                        plugin_id: identity.plugin_id.to_owned(),
                        service: identity.service.to_owned(),
                    })),
                },
            )?;
            true
        }
        _ => {
            write_error(
                &mut writer,
                frame.request_id,
                BackendError::new("PROTOCOL_MISMATCH", "invalid native backend initialization"),
            )?;
            false
        }
    };
    if !initialized {
        return Ok(());
    }

    while let Some(frame) = read_frame(&mut reader)? {
        let response = match frame.body {
            Some(Body::CallRequest(request))
                if request
                    .method
                    .starts_with(&format!("/{}/", identity.service)) =>
            {
                match dispatch(&request.method, &request.payload) {
                    Ok(payload) => NativeFrame {
                        request_id: frame.request_id,
                        body: Some(Body::CallResponse(CallResponse { payload })),
                    },
                    Err(error) => error_frame(frame.request_id, error),
                }
            }
            Some(Body::CallRequest(_)) => error_frame(
                frame.request_id,
                BackendError::new(
                    "METHOD_NOT_FOUND",
                    "method does not belong to the declared service",
                ),
            ),
            _ => error_frame(
                frame.request_id,
                BackendError::new("INVALID_REQUEST", "expected a native call request"),
            ),
        };
        write_frame(&mut writer, &response)?;
    }
    Ok(())
}

fn read_frame(reader: &mut impl Read) -> io::Result<Option<NativeFrame>> {
    let mut length = [0_u8; 4];
    let read = reader.read(&mut length[..1])?;
    if read == 0 {
        return Ok(None);
    }
    reader.read_exact(&mut length[1..])?;
    let length = u32::from_le_bytes(length) as usize;
    if length == 0 || length > MAX_FRAME_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid native frame length",
        ));
    }
    let mut payload = vec![0_u8; length];
    reader.read_exact(&mut payload)?;
    NativeFrame::decode(payload.as_slice())
        .map(Some)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

fn write_frame(writer: &mut impl Write, frame: &NativeFrame) -> io::Result<()> {
    let payload = frame.encode_to_vec();
    if payload.is_empty() || payload.len() > MAX_FRAME_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid native frame length",
        ));
    }
    writer.write_all(&(payload.len() as u32).to_le_bytes())?;
    writer.write_all(&payload)?;
    writer.flush()
}

fn write_error(writer: &mut impl Write, request_id: u32, error: BackendError) -> io::Result<()> {
    write_frame(writer, &error_frame(request_id, error))
}

fn error_frame(request_id: u32, error: BackendError) -> NativeFrame {
    NativeFrame {
        request_id,
        body: Some(Body::CallError(CallError {
            code: error.code,
            message: error.message,
        })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use generated::scalpel::plugin::native::v1::{CallRequest, InitializeRequest};

    fn encoded_frames(frames: &[NativeFrame]) -> Vec<u8> {
        let mut bytes = Vec::new();
        for frame in frames {
            write_frame(&mut bytes, frame).unwrap();
        }
        bytes
    }

    #[test]
    fn serves_initialized_calls() {
        let input = encoded_frames(&[
            NativeFrame {
                request_id: 0,
                body: Some(Body::InitializeRequest(InitializeRequest {
                    protocol_version: PROTOCOL_VERSION,
                    plugin_id: "example".into(),
                    service: "example.v1.Service".into(),
                })),
            },
            NativeFrame {
                request_id: 7,
                body: Some(Body::CallRequest(CallRequest {
                    method: "/example.v1.Service/Run".into(),
                    payload: vec![1, 2, 3],
                })),
            },
        ]);
        let mut output = Vec::new();
        serve(
            BackendIdentity {
                plugin_id: "example",
                service: "example.v1.Service",
            },
            input.as_slice(),
            &mut output,
            |method, payload| {
                assert_eq!(method, "/example.v1.Service/Run");
                Ok(payload.iter().rev().copied().collect())
            },
        )
        .unwrap();

        let mut output = output.as_slice();
        assert!(matches!(
            read_frame(&mut output).unwrap().unwrap().body,
            Some(Body::InitializeResponse(_))
        ));
        let response = read_frame(&mut output).unwrap().unwrap();
        assert_eq!(response.request_id, 7);
        assert!(
            matches!(response.body, Some(Body::CallResponse(CallResponse { payload })) if payload == [3, 2, 1])
        );
    }

    #[test]
    fn rejects_oversized_frames_before_allocating() {
        let length = ((MAX_FRAME_BYTES + 1) as u32).to_le_bytes();
        let mut input = length.as_slice();
        let error = read_frame(&mut input).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
    }
}
