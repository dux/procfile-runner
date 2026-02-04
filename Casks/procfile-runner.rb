cask "procfile-runner" do
  version "1.0.0"
  sha256 "b3bc231c64e5ce92ea52a2795171e5161b4cfee2d6b3d727cd57175d2e155ace"

  url "https://github.com/dux/procfile-runner/releases/download/v#{version}/Procfile-Runner-#{version}-mac.zip"
  name "Procfile Runner"
  desc "Native desktop application for managing multiple processes defined in a Procfile"
  homepage "https://github.com/dux/procfile-runner"

  depends_on macos: ">= :high_sierra"

  app "Procfile Runner.app"

  zap trash: [
    "~/.config/procfile-runner",
  ]
end
