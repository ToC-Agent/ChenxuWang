const {
  contextBridge,
  ipcRenderer,
} =
  require("electron");

contextBridge.exposeInMainWorld(
  "tongyuDesktop",
  {
    runtime: {
      getStatus:
        () =>
          ipcRenderer.invoke(
            "tongyu:runtime:get-status",
          ),

      restart:
        () =>
          ipcRenderer.invoke(
            "tongyu:runtime:restart",
          ),

      onStatus:
        (
          callback,
        ) => {
          const listener =
            (
              _event,
              status,
            ) => {
              callback(
                status,
              );
            };

          ipcRenderer.on(
            "tongyu:runtime:status",
            listener,
          );

          return () => {
            ipcRenderer.removeListener(
              "tongyu:runtime:status",
              listener,
            );
          };
        },
    },

    agent: {
      sendMessage:
        (
          sessionId,
          content,
        ) =>
          ipcRenderer.invoke(
            "tongyu:agent:send-message",
            sessionId,
            content,
          ),

      interrupt:
        (
          sessionId,
        ) =>
          ipcRenderer.invoke(
            "tongyu:agent:interrupt",
            sessionId,
          ),

      respondPermission:
        (
          sessionId,
          permissionRequestId,
          decision,
        ) =>
          ipcRenderer.invoke(
            "tongyu:agent:permission",
            sessionId,
            permissionRequestId,
            decision,
          ),

      onEvent:
        (
          callback,
        ) => {
          const listener =
            (
              _event,
              runtimeEvent,
            ) => {
              callback(
                runtimeEvent,
              );
            };

          ipcRenderer.on(
            "tongyu:agent:event",
            listener,
          );

          return () => {
            ipcRenderer.removeListener(
              "tongyu:agent:event",
              listener,
            );
          };
        },
    },

    sessions: {
      list:
        () =>
          ipcRenderer.invoke(
            "tongyu:sessions:list",
          ),

      create:
        () =>
          ipcRenderer.invoke(
            "tongyu:sessions:create",
          ),

      resume:
        (
          sessionId,
        ) =>
          ipcRenderer.invoke(
            "tongyu:sessions:resume",
            sessionId,
          ),

      close:
        (
          sessionId,
        ) =>
          ipcRenderer.invoke(
            "tongyu:sessions:close",
            sessionId,
          ),
    },
  },
);
