class AnotherMarkdownEditor < Formula
  desc "A WYSIWYG markdown editor for Windows, macOS, and Linux, built with Electron and Milkdown."
  homepage "https://github.com/yetanotherchris/another-markdown-editor"
  version "0.0.93"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.93/ameditor-0.0.93-macos-arm64.zip"
      sha256 "a4964fa8d4ed6ae89f82d64f62d64ada1f9ba554e12687757412c8d91ede1e6a"
    else
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.93/ameditor-0.0.93-macos-x64.zip"
      sha256 "31e2cd0bb88de4db11097ad362d854509eebb65d80cbee40c436301a74439bba"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      odie "Another Markdown Editor does not provide a Linux arm64 build"
    else
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.93/ameditor-0.0.93-linux-x64.AppImage"
      sha256 "3620cbbc3c3822e18d8ceea4d2659ef1401d122896e750f9a0ef27fcae9578d8"
    end
  end

  def install
    if OS.mac?
      app.install "Another Markdown Editor.app"
    else
      bin.install "ameditor-0.0.93-linux-x64.AppImage" => "another-markdown-editor"
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
