class AnotherMarkdownEditor < Formula
  desc "A WYSIWYG markdown editor for Windows, macOS, and Linux, built with Electron and Milkdown."
  homepage "https://github.com/yetanotherchris/another-markdown-editor"
  version "0.0.91"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.83/Another%20Markdown%20Editor-0.0.83-macos-arm64.zip"
      sha256 "1ef0c36a1ba245ab63c1de58c16c6bde1420fbf25f1b9c99c773ea3f7b7a63a3"
    else
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.83/Another%20Markdown%20Editor-0.0.83-macos-x64.zip"
      sha256 "48d44e07c3024a3ff71eb47322f68e9cd6b0fccb11bfe90bc912bc30e1cb3ed9"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      odie "Another Markdown Editor does not provide a Linux arm64 build"
    else
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.83/Another%20Markdown%20Editor-0.0.83-linux-x64.AppImage"
      sha256 "b59dc5c70aef2876b001e75074c31022777e01c97c4308231268441ee3b91527"
    end
  end

  def install
    if OS.mac?
      app.install "Another Markdown Editor.app"
    else
      bin.install "Another Markdown Editor-0.0.83-linux-x64.AppImage" => "another-markdown-editor"
    end
  end

  test do
    if OS.mac?
      assert_predicate prefix/"Another Markdown Editor.app", :exist?
    else
      assert_predicate bin/"another-markdown-editor", :exist?
    end
  end
end
