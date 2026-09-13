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
  },
);
