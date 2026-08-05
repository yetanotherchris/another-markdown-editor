class AnotherMarkdownEditor < Formula
  desc "A WYSIWYG markdown editor for Windows, macOS, and Linux, built with Electron and Milkdown."
  homepage "https://github.com/yetanotherchris/another-markdown-editor"
  version "0.0.95"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.95/ameditor-0.0.95-macos-arm64.zip"
      sha256 "ec703095dfd5b66bbe2a59a38d4e440a6c134cdd94ecec98189e7beda4affb8f"
    else
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.95/ameditor-0.0.95-macos-x64.zip"
      sha256 "b9767437b04e58bd3cba5787bc4d34d894cfc851820f5a6a9187d9189089bb7b"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      odie "Another Markdown Editor does not provide a Linux arm64 build"
    else
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.95/ameditor-0.0.95-linux-x64.AppImage"
      sha256 "b377d7968f6ebc8bd37987a963e935851a862a4d321e57ae1c4c05ffd04f1abc"
    end
  end

  def install
    if OS.mac?
      app.install "Another Markdown Editor.app"
    else
      bin.install "ameditor-0.0.95-linux-x64.AppImage" => "ameditor"
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
