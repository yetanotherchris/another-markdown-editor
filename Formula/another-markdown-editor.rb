class AnotherMarkdownEditor < Formula
  desc "A WYSIWYG markdown editor for Windows, macOS, and Linux, built with Electron and Milkdown."
  homepage "https://github.com/yetanotherchris/another-markdown-editor"
  version "0.0.94"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.94/ameditor-0.0.94-macos-arm64.zip"
      sha256 "b707f86eea26048853080b3785548cad450a3443dd31794b34c4e6ce550468ff"
    else
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.94/ameditor-0.0.94-macos-x64.zip"
      sha256 "9eaf2417b4dc46dbb4d00630276e26efc48b9c63a62bdcf5262cd5ab5876223f"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      odie "Another Markdown Editor does not provide a Linux arm64 build"
    else
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.94/ameditor-0.0.94-linux-x64.AppImage"
      sha256 "a8ffe5c249324ddfc2447b64371b5f2e39165fdbe918404683e9090863db6329"
    end
  end

  def install
    if OS.mac?
      app.install "Another Markdown Editor.app"
    else
      bin.install "ameditor-0.0.94-linux-x64.AppImage" => "ameditor"
    end
  end

  test do
    if OS.mac?
      assert_predicate prefix/"Another Markdown Editor.app", :exist?
    else
      assert_predicate bin/"ameditor", :exist?
    end
  end
end
