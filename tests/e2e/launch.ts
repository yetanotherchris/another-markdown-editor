/**
 * Shared Electron launch args for the e2e suite.
 *
 * The app runs under Chromium's `--headless` switch so the suite never steals
 * desktop focus while it runs (the Electron windows are not shown on screen).
 * Set `AME_E2E_HEADED=1` to run with a visible, interactive window — e.g. when
 * debugging a failing scenario locally.
 */
export const electronLaunchArgs: string[] = process.env.AME_E2E_HEADED
  ? ['out/main/index.js']
  : ['out/main/index.js', '--headless']
