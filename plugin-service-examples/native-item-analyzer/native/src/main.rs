use prost::Message;
use scalpel_plugin_native::{BackendError, BackendIdentity, serve_stdio};
use sha2::{Digest, Sha256};

mod generated {
    include!(concat!(env!("OUT_DIR"), "/native_item_analyzer.rs"));
}

use generated::scalpel::examples::item_analyzer::v1::{AnalyzeItemRequest, AnalyzeItemResponse};

const PLUGIN_ID: &str = "native-item-analyzer";
const SERVICE: &str = "scalpel.examples.item_analyzer.v1.NativeItemAnalyzer";
const ANALYZE_ITEM: &str = "/scalpel.examples.item_analyzer.v1.NativeItemAnalyzer/AnalyzeItem";

fn analyze_item(request: AnalyzeItemRequest) -> AnalyzeItemResponse {
    let numeric_tokens = request
        .implicits
        .iter()
        .chain(&request.explicits)
        .flat_map(|line| line.split(|character: char| !character.is_ascii_digit()))
        .filter(|token| !token.is_empty())
        .count() as u32;
    let total_mods = (request.implicits.len() + request.explicits.len()) as u32;
    let mut hash = Sha256::new();
    for value in [&request.name, &request.base_type, &request.rarity] {
        hash.update(value.as_bytes());
        hash.update([0]);
    }
    hash.update(request.item_level.to_le_bytes());
    hash.update([0]);
    for modifier in request.implicits.iter().chain(&request.explicits) {
        hash.update(modifier.trim().as_bytes());
        hash.update([0]);
    }
    let display_name = if request.name.trim().is_empty() {
        request.base_type
    } else {
        format!("{} {}", request.name.trim(), request.base_type.trim())
    };
    AnalyzeItemResponse {
        display_name,
        fingerprint: format!("{:x}", hash.finalize()),
        total_mods,
        numeric_tokens,
    }
}

fn dispatch(method: &str, payload: &[u8]) -> Result<Vec<u8>, BackendError> {
    if method != ANALYZE_ITEM {
        return Err(BackendError::new(
            "METHOD_NOT_FOUND",
            format!("unknown method: {method}"),
        ));
    }
    let request = AnalyzeItemRequest::decode(payload)
        .map_err(|error| BackendError::new("INVALID_ARGUMENT", error.to_string()))?;
    Ok(analyze_item(request).encode_to_vec())
}

fn main() -> std::io::Result<()> {
    serve_stdio(
        BackendIdentity {
            plugin_id: PLUGIN_ID,
            service: SERVICE,
        },
        dispatch,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> AnalyzeItemRequest {
        AnalyzeItemRequest {
            name: "Doom".into(),
            base_type: "Spiral Ring".into(),
            rarity: "Rare".into(),
            item_level: 84,
            implicits: vec!["+12% to Fire Resistance".into()],
            explicits: vec![
                "+75 to maximum Life".into(),
                "+30% to Cold Resistance".into(),
            ],
        }
    }

    #[test]
    fn analyzes_generated_request_types() {
        let result = analyze_item(request());
        assert_eq!(result.display_name, "Doom Spiral Ring");
        assert_eq!(result.total_mods, 3);
        assert_eq!(result.numeric_tokens, 3);
        assert_eq!(result.fingerprint.len(), 64);
    }

    #[test]
    fn dispatches_protobuf_payloads() {
        let response = dispatch(ANALYZE_ITEM, &request().encode_to_vec()).unwrap();
        let response = AnalyzeItemResponse::decode(response.as_slice()).unwrap();
        assert_eq!(response.total_mods, 3);
    }

    #[test]
    fn rejects_malformed_payloads() {
        let error = dispatch(ANALYZE_ITEM, &[0xff]).unwrap_err();
        assert_eq!(error.code, "INVALID_ARGUMENT");
    }
}
