cask "procfile-runner" do
  version "1.2.0"
  sha256 "0478f5fbec5276b7ecd0f6c2f3005d2214df1c0ab67dfa427ccff1156bf8c71d"

  url "https://github.com/dux/procfile-runner/releases/download/v#{version}/Procfile-Runner-#{version}-mac.zip"
  name "Procfile Runner"
  desc "Native desktop application for managing multiple processes defined in a Procfile"
  homepage "https://github.com/dux/procfile-runner"

  depends_on macos: ">= :high_sierra"

  app "Procfile Runner.app"

  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-d", "com.apple.quarantine", "#{appdir}/Procfile Runner.app"],
                   sudo: false
  end

  zap trash: [
    "~/.config/procfile-runner",
  ]
end
