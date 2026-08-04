class AnotherMarkdownEditor < Formula
  desc "A WYSIWYG markdown editor for Windows, macOS, and Linux, built with Electron and Milkdown."
  homepage "https://github.com/yetanotherchris/another-markdown-editor"
  version "0.0.83"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.83/ameditor-0.0.83-macos-arm64.zip"
      sha256 "e34844a485e01e48095e2e3088d80335a03215a883d0892affcbafa246aa75f3"
    else
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.83/ameditor-0.0.83-macos-x64.zip"
      sha256 "5156917b8fc34f9cd387f85e6a6b7958ffb0cdb079cebe81616353b897f91265"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      odie "Another Markdown Editor does not provide a Linux arm64 build"
    else
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.83/ameditor-0.0.83-linux-x64.AppImage"
      sha256 "ddf850cdb4455ce837292999be91a6c89e2ddabf60805d50f8f7507cf41f4e0b"
    end
  end

  def install
    if OS.mac?
      app.install "Another Markdown Editor.app"
    else
      bin.install "ameditor-0.0.83-linux-x64.AppImage" => "another-markdown-editor"
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
