{
  description = "bun for NPA development";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  inputs.systems.url = "github:nix-systems/default";
  inputs.flake-utils = {
    url = "github:numtide/flake-utils";
    inputs.systems.follows = "systems";
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShellNoCC {
          packages = with pkgs; [ bun ];
          # Native iOS signing/archiving requires the installed Apple Xcode,
          # not nixpkgs' macOS SDK or xcbuild/xcrun compatibility tools.
          shellHook = pkgs.lib.optionalString pkgs.stdenv.isDarwin ''
            export DEVELOPER_DIR="''${NPA_XCODE_DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
            unset SDKROOT SDK_DIR TOOLCHAINS
            export PATH="$DEVELOPER_DIR/usr/bin:/usr/bin:/bin:$PATH"
            if [ ! -x "$DEVELOPER_DIR/usr/bin/xcodebuild" ]; then
              echo "NPA: Xcode not found at $DEVELOPER_DIR; set NPA_XCODE_DEVELOPER_DIR before entering nix develop for iOS releases." >&2
            fi
          '';
        };
      }
    );
}
