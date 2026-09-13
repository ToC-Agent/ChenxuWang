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

let activeSessionId:
  string | null =
    null;


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

      activeSessionId =
        null;

      await runtimeHost.start();

      return currentRuntimeStatus();
    },
  );

  ipcMain.handle(
    "tongyu:sessions:list",
    async () => {
      if (
        !runtimeHost
      ) {
        throw new Error(
          "Tongyu Runtime Host is not initialized.",
        );
      }

      const result =
        await runtimeHost
          .requireClient()
          .listSessions();

      return {
        items:
          result.items,

        activeSessionId,
      };
    },
  );

  ipcMain.handle(
    "tongyu:sessions:create",
    async () => {
      if (
        !runtimeHost
      ) {
        throw new Error(
          "Tongyu Runtime Host is not initialized.",
        );
      }

      const created =
        await runtimeHost
          .requireClient()
          .createSession(
            app.getAppPath(),
          );

      activeSessionId =
        created.sessionId;

      return created;
    },
  );

  ipcMain.handle(
    "tongyu:sessions:resume",
    async (
      _event,
      sessionId:
        unknown,
    ) => {
      if (
        !runtimeHost
      ) {
        throw new Error(
          "Tongyu Runtime Host is not initialized.",
        );
      }

      if (
        typeof sessionId !==
          "string" ||
        !sessionId
      ) {
        throw new Error(
          "A valid sessionId is required.",
        );
      }

      const resumed =
        await runtimeHost
          .requireClient()
          .resumeSession(
            sessionId,
          );

      activeSessionId =
        resumed.sessionId;

      return resumed;
    },
  );

  ipcMain.handle(
    "tongyu:sessions:close",
    async (
      _event,
      sessionId:
        unknown,
    ) => {
      if (
        !runtimeHost
      ) {
        throw new Error(
          "Tongyu Runtime Host is not initialized.",
        );
      }

      if (
        typeof sessionId !==
          "string" ||
        !sessionId
      ) {
        throw new Error(
          "A valid sessionId is required.",
        );
      }

      const closed =
        await runtimeHost
          .requireClient()
          .closeSession(
            sessionId,
          );

      if (
        activeSessionId ===
          sessionId
      ) {
        activeSessionId =
          null;
      }

      return closed;
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

  const sessionBridge:
    unknown =
    await window.webContents
      .executeJavaScript(
        `
          (async () => {
            const created =
              await window.tongyuDesktop.sessions.create();

            const listed =
              await window.tongyuDesktop.sessions.list();

            const resumed =
              await window.tongyuDesktop.sessions.resume(
                created.sessionId,
              );

            const closed =
              await window.tongyuDesktop.sessions.close(
                created.sessionId,
              );

            return {
              sessionId:
                created.sessionId,

              listed:
                listed.items.some(
                  (item) =>
                    item.sessionId ===
                      created.sessionId,
                ),

              resumedSessionId:
                resumed.sessionId,

              closedType:
                closed.type,
            };
          })()
        `,
      );

  if (
    typeof sessionBridge !==
      "object" ||
    sessionBridge ===
      null
  ) {
    throw new Error(
      "Desktop Session Bridge returned an invalid result.",
    );
  }

  const sessionResult =
    sessionBridge as {
      sessionId?:
        unknown;

      listed?:
        unknown;

      resumedSessionId?:
        unknown;

      closedType?:
        unknown;
    };

  if (
    typeof sessionResult.sessionId !==
      "string" ||
    sessionResult.listed !==
      true ||
    sessionResult.resumedSessionId !==
      sessionResult.sessionId ||
    sessionResult.closedType !==
      "session.end"
  ) {
    throw new Error(
      `Desktop Session Bridge failed: ${JSON.stringify(
        sessionResult,
      )}`,
    );
  }

  console.log(
    "[tongyu-desktop-smoke] sessions=create,list,resume,close",
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
