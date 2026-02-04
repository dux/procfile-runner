cask "procfile-runner" do
  version "1.1.0"
  sha256 "029957be8301125f765d624602a1199c3c1112d4df217c2dfe955df44783319a"

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
