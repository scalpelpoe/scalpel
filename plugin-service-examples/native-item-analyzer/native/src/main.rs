use schemars::{JsonSchema, schema_for};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::io::{self, BufRead, Write};

const MAX_REQUEST_BYTES: usize = 1024 * 1024;

#[derive(Deserialize)]
struct Request {
    id: u64,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Serialize)]
struct Response {
    id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ErrorBody>,
}

#[derive(Serialize)]
struct ErrorBody {
    code: &'static str,
    message: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct AnalyzeItemParams {
    name: String,
    base_type: String,
    rarity: String,
    item_level: u32,
    implicits: Vec<String>,
    explicits: Vec<String>,
}

#[derive(Serialize, JsonSchema, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
struct AnalyzeItemResult {
    display_name: String,
    fingerprint: String,
    total_mods: usize,
    numeric_tokens: usize,
}

fn analyze_item(params: AnalyzeItemParams) -> AnalyzeItemResult {
    let display_name = if params.name.trim().is_empty() {
        params.base_type.clone()
    } else {
        format!("{} {}", params.name.trim(), params.base_type.trim())
    };
    let mods = params.implicits.iter().chain(params.explicits.iter());
    let numeric_tokens = mods
        .clone()
        .flat_map(|line| line.split(|character: char| !character.is_ascii_digit()))
        .filter(|token| !token.is_empty())
        .count();
    let mut hash = Sha256::new();
    for value in [
        params.name.as_str(),
        params.base_type.as_str(),
        params.rarity.as_str(),
        &params.item_level.to_string(),
    ] {
        hash.update(value.as_bytes());
        hash.update([0]);
    }
    for modifier in params.implicits.iter().chain(params.explicits.iter()) {
        hash.update(modifier.trim().as_bytes());
        hash.update([0]);
    }
    AnalyzeItemResult {
        display_name,
        fingerprint: format!("{:x}", hash.finalize()),
        total_mods: params.implicits.len() + params.explicits.len(),
        numeric_tokens,
    }
}

fn contract() -> Value {
    let params_schema = serde_json::to_value(schema_for!(AnalyzeItemParams)).expect("params schema");
    let result_schema = serde_json::to_value(schema_for!(AnalyzeItemResult)).expect("result schema");
    let required = params_schema
        .get("required")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let parameters = params_schema
        .get("properties")
        .and_then(Value::as_object)
        .expect("object properties")
        .iter()
        .map(|(name, schema)| {
            json!({
                "name": name,
                "required": required.iter().any(|value| value.as_str() == Some(name)),
                "schema": schema,
            })
        })
        .collect::<Vec<_>>();
    json!({
        "$schema": "https://spec.open-rpc.org/meta-schema.json",
        "openrpc": "1.4.0",
        "info": {
            "title": "Native Item Analyzer Backend",
            "version": "1.0.0",
            "description": "Private request/response contract between the plugin renderer and its Rust sidecar."
        },
        "methods": [{
            "name": "analyzeItem",
            "summary": "Fingerprint and summarize a parsed Path of Exile item.",
            "paramStructure": "by-name",
            "params": parameters,
            "result": { "name": "analysis", "schema": result_schema }
        }]
    })
}

fn success(id: u64, result: Value) -> Response {
    Response { id, result: Some(result), error: None }
}

fn failure(id: u64, code: &'static str, message: impl Into<String>) -> Response {
    Response {
        id,
        result: None,
        error: Some(ErrorBody { code, message: message.into() }),
    }
}

fn handle(request: Request) -> Response {
    match request.method.as_str() {
        "scalpel.initialize" => {
            if request.params.get("protocolVersion").and_then(Value::as_u64) != Some(1) {
                failure(request.id, "PROTOCOL_MISMATCH", "expected protocolVersion 1")
            } else {
                success(request.id, json!({ "protocolVersion": 1 }))
            }
        }
        "analyzeItem" => match serde_json::from_value::<AnalyzeItemParams>(request.params) {
            Ok(params) => success(request.id, serde_json::to_value(analyze_item(params)).expect("serialize result")),
            Err(error) => failure(request.id, "INVALID_PARAMS", error.to_string()),
        },
        _ => failure(request.id, "METHOD_NOT_FOUND", format!("unknown method: {}", request.method)),
    }
}

fn run() -> Result<(), String> {
    if std::env::args().nth(1).as_deref() == Some("--print-contract") {
        println!("{}", serde_json::to_string_pretty(&contract()).map_err(|error| error.to_string())?);
        return Ok(());
    }

    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line.map_err(|error| error.to_string())?;
        if line.len() > MAX_REQUEST_BYTES {
            return Err("request exceeded one MiB".to_string());
        }
        let request = serde_json::from_str::<Request>(&line).map_err(|error| format!("invalid request: {error}"))?;
        serde_json::to_writer(&mut stdout, &handle(request)).map_err(|error| error.to_string())?;
        stdout.write_all(b"\n").map_err(|error| error.to_string())?;
        stdout.flush().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn analyzes_item_deterministically() {
        let result = analyze_item(AnalyzeItemParams {
            name: "Doom Bite".to_string(),
            base_type: "Vaal Axe".to_string(),
            rarity: "Rare".to_string(),
            item_level: 86,
            implicits: vec!["20% increased Damage".to_string()],
            explicits: vec!["Adds 10 to 20 Physical Damage".to_string()],
        });
        assert_eq!(result.display_name, "Doom Bite Vaal Axe");
        assert_eq!(result.total_mods, 2);
        assert_eq!(result.numeric_tokens, 3);
        assert_eq!(result.fingerprint.len(), 64);
    }

    #[test]
    fn contract_matches_protocol_method() {
        let document = contract();
        assert_eq!(document["info"]["version"], "1.0.0");
        assert_eq!(document["methods"][0]["name"], "analyzeItem");
    }
}
