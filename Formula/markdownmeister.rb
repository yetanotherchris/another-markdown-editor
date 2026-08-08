class Markdownmeister < Formula
  desc "A WYSIWYG markdown editor for Windows, macOS, and Linux, built with Electron and Milkdown."
  homepage "https://github.com/yetanotherchris/another-markdown-editor"
  version "0.0.96"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.96/markdownmeister-0.0.96-macos-arm64.zip"
      sha256 "21da416689a19e6d2bbd9fb6e084fea350ca7eb56bba8308a915dd08c584d808"
    else
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.96/markdownmeister-0.0.96-macos-x64.zip"
      sha256 "05e72e44ff1f9226a251343374ab937244deb4d9118db53ddbbf3ecd4897075d"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      odie "MarkdownMeister does not provide a Linux arm64 build"
    else
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.96/markdownmeister-0.0.96-linux-x64.AppImage"
      sha256 "ef12dace94f3acb07428580fa6a1d953c97d8d62a4e424328b9cb9d7e2a178a1"
    end
  end

  def install
    if OS.mac?
      app.install "MarkdownMeister.app"
    else
      bin.install "markdownmeister-0.0.96-linux-x64.AppImage" => "markdownmeister"
    end
  end

  test do
    if OS.mac?
      assert_predicate prefix/"MarkdownMeister.app", :exist?
    else
      assert_predicate bin/"markdownmeister", :exist?
    end
  end
end
