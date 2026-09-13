import {
  app,
  BrowserWindow,
  ipcMain,
} from "electron";

import {
  join,
} from "node:path";

import {
  TongyuDesktopRuntimeHost,
  type DesktopRuntimeHostSnapshot,
} from "../desktop/index.js";

import {
  TONGYU_VERSION,
} from "../constants.js";

interface DesktopRuntimeStatus {
  state:
    DesktopRuntimeHostSnapshot["state"];

  lastExit: {
    code:
      number | null;

    signal:
      NodeJS.Signals | null;
  } | null;

  lastError:
    string | null;
}

let runtimeHost:
  TongyuDesktopRuntimeHost |
  undefined;

let allowQuit =
  false;

function serializeRuntimeStatus(
  snapshot:
    DesktopRuntimeHostSnapshot,
): DesktopRuntimeStatus {
  return {
    state:
      snapshot.state,

    lastExit:
      snapshot.lastExit,

    lastError:
      snapshot.lastError
        ? snapshot.lastError.message
        : null,
  };
}

function currentRuntimeStatus():
  DesktopRuntimeStatus {
  if (
    !runtimeHost
  ) {
    return {
      state:
        "stopped",

      lastExit:
        null,

      lastError:
        null,
    };
  }

  return serializeRuntimeStatus(
    runtimeHost.snapshot,
  );
}

function broadcastRuntimeStatus(): void {
  const payload =
    currentRuntimeStatus();

  for (
    const window of
      BrowserWindow.getAllWindows()
  ) {
    if (
      window.isDestroyed()
    ) {
      continue;
    }

    window.webContents.send(
      "tongyu:runtime:status",
      payload,
    );
  }
}

function createRuntimeHost():
  TongyuDesktopRuntimeHost {
  const appRoot =
    app.getAppPath();

  /*
   * During development npm exposes the exact Node executable
   * through npm_node_execpath.
   *
   * Production packaging will replace this with Tongyu's
   * bundled Runtime executable. Do not couple the Desktop API
   * to this development detail.
   */
  const nodeExecutable =
    process.env[
      "TONGYU_NODE_EXECUTABLE"
    ] ??
    process.env[
      "npm_node_execpath"
    ] ??
    "node";

  const host =
    new TongyuDesktopRuntimeHost({
      command:
        nodeExecutable,

      args: [
        join(
          appRoot,
          "dist",
          "cli.js",
        ),

        "server",
      ],

      cwd:
        appRoot,

      env:
        process.env,

      clientName:
        "tongyu-desktop",

      clientVersion:
        TONGYU_VERSION,
    });

  host.onStatus(
    () => {
      broadcastRuntimeStatus();
    },
  );

  return host;
}

function registerDesktopIpc(): void {
  ipcMain.handle(
    "tongyu:runtime:get-status",
    () => {
      return currentRuntimeStatus();
    },
  );

  ipcMain.handle(
    "tongyu:runtime:restart",
    async () => {
      if (
        !runtimeHost
      ) {
        throw new Error(
          "Tongyu Runtime Host is not initialized.",
        );
      }

      await runtimeHost.stop();

      await runtimeHost.start();

      return currentRuntimeStatus();
    },
  );
}

function createWindow(
  show:
    boolean,
): BrowserWindow {
  const appRoot =
    app.getAppPath();

  const window =
    new BrowserWindow({
      width:
        1180,

      height:
        760,

      minWidth:
        840,

      minHeight:
        560,

      show,

      title:
        "Tongyu",

      webPreferences: {
        preload:
          join(
            appRoot,
            "src",
            "desktop-app",
            "preload.cjs",
          ),

        contextIsolation:
          true,

        nodeIntegration:
          false,

        sandbox:
          true,
      },
    });

  void window.loadFile(
    join(
      appRoot,
      "src",
      "desktop-app",
      "renderer",
      "index.html",
    ),
  );

  return window;
}

async function runSmokeTest(
  window:
    BrowserWindow,
): Promise<void> {
  if (
    !runtimeHost
  ) {
    throw new Error(
      "Tongyu Runtime Host is not initialized.",
    );
  }

  await new Promise<void>(
    (
      resolve,
      reject,
    ) => {
      window.webContents.once(
        "did-finish-load",
        () => {
          resolve();
        },
      );

      window.webContents.once(
        "did-fail-load",
        (
          _event,
          errorCode,
          errorDescription,
        ) => {
          reject(
            new Error(
              `Desktop renderer failed to load: ${errorCode} ${errorDescription}`,
            ),
          );
        },
      );
    },
  );

  await runtimeHost.start();

  const bridgeState:
    unknown =
    await window.webContents
      .executeJavaScript(
        `
          window.tongyuDesktop
            .runtime
            .getStatus()
            .then((status) => status.state)
        `,
      );

  if (
    bridgeState !==
      "running"
  ) {
    throw new Error(
      `Desktop IPC bridge returned unexpected Runtime state: ${String(
        bridgeState,
      )}`,
    );
  }

  console.log(
    "[tongyu-desktop-smoke] renderer=loaded bridge=ready runtime=running",
  );

  await runtimeHost.stop();

  console.log(
    "[tongyu-desktop-smoke] runtime=stopped",
  );
}

app.whenReady()
  .then(
    async () => {
      runtimeHost =
        createRuntimeHost();

      registerDesktopIpc();

      const smokeMode =
        process.argv.includes(
          "--smoke",
        );

      const window =
        createWindow(
          !smokeMode,
        );

      if (
        smokeMode
      ) {
        try {
          await runSmokeTest(
            window,
          );

          app.quit();
        } catch (error) {
          console.error(
            "[tongyu-desktop-smoke] failed",
            error,
          );

          process.exitCode =
            1;

          try {
            await runtimeHost.stop();
          } catch {
            // Preserve the smoke-test failure.
          }

          app.quit();
        }

        return;
      }

      void runtimeHost
        .start()
        .catch(
          (
            error,
          ) => {
            console.error(
              "[tongyu-desktop] runtime startup failed",
              error,
            );
          },
        );

      app.on(
        "activate",
        () => {
          if (
            BrowserWindow
              .getAllWindows()
              .length ===
              0
          ) {
            createWindow(
              true,
            );
          }
        },
      );
    },
  )
  .catch(
    (
      error,
    ) => {
      console.error(
        "[tongyu-desktop] startup failed",
        error,
      );

      process.exitCode =
        1;

      app.quit();
    },
  );

app.on(
  "window-all-closed",
  () => {
    if (
      process.platform !==
        "darwin"
    ) {
      app.quit();
    }
  },
);

app.on(
  "before-quit",
  (
    event,
  ) => {
    if (
      allowQuit ||
      !runtimeHost ||
      runtimeHost.state ===
        "stopped"
    ) {
      allowQuit =
        true;

      return;
    }

    event.preventDefault();

    void runtimeHost
      .stop()
      .catch(
        (
          error,
        ) => {
          console.error(
            "[tongyu-desktop] runtime shutdown failed",
            error,
          );
        },
      )
      .finally(
        () => {
          allowQuit =
            true;

          app.quit();
        },
      );
  },
);
