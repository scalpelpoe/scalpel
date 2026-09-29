fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto = "proto/scalpel/plugin/native/v1/transport.proto";
    println!("cargo:rerun-if-changed={proto}");

    let mut config = prost_build::Config::new();
    config.protoc_executable(protoc_bin_vendored::protoc_bin_path()?);
    config.include_file("scalpel_plugin_native.rs");
    config.compile_protos(&[proto], &["proto"])?;
    Ok(())
}
