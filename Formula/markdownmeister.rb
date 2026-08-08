class Markdownmeister < Formula
  desc "A WYSIWYG markdown editor for Windows, macOS, and Linux, built with Electron and Milkdown."
  homepage "https://github.com/yetanotherchris/another-markdown-editor"
  version "0.0.97"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.97/markdownmeister-0.0.97-macos-arm64.zip"
      sha256 "f5f853be5fa0808acc0c8caa9eddb7bc6c882c8650ffd12f745a4b531f2485f5"
    else
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.97/markdownmeister-0.0.97-macos-x64.zip"
      sha256 "0475eb3493a38053415337cd229fda140017ebcb2890d0ef153638be7c11e85b"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      odie "MarkdownMeister does not provide a Linux arm64 build"
    else
      url "https://github.com/yetanotherchris/another-markdown-editor/releases/download/v0.0.97/markdownmeister-0.0.97-linux-x64.AppImage"
      sha256 "6d395bcb11ea1740157749c8184ae31a4cbb7e31cc8c632ea334dc1aefb23cfc"
    end
  end

  def install
    if OS.mac?
      app.install "MarkdownMeister.app"
    else
      bin.install "markdownmeister-0.0.97-linux-x64.AppImage" => "markdownmeister"
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
