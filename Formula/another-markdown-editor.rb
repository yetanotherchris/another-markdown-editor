class AnotherMarkdownEditor < Formula
  desc "A WYSIWYG markdown editor for Windows, macOS, and Linux, built with Electron and Milkdown."
  homepage "https://github.com/yetanotherchris/another-markdown-editor"
  version "0.1.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.1.0/Another%20Markdown%20Editor-0.1.0-macos-arm64.zip"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    else
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.1.0/Another%20Markdown%20Editor-0.1.0-macos-x64.zip"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  on_linux do
    url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.1.0/Another%20Markdown%20Editor-0.1.0-linux-x64.AppImage"
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  end

  def install
    if OS.mac?
      app.install "Another Markdown Editor.app"
    else
      bin.install "Another Markdown Editor-0.1.0-linux-x64.AppImage" => "another-markdown-editor"
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
