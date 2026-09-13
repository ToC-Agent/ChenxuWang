const stateElement =
  document.getElementById(
    "runtime-state",
  );

const dotElement =
  document.getElementById(
    "runtime-dot",
  );

const detailsElement =
  document.getElementById(
    "runtime-details",
  );

const restartButton =
  document.getElementById(
    "restart-runtime",
  );

const newSessionButton =
  document.getElementById(
    "new-session",
  );

const sessionListElement =
  document.getElementById(
    "session-list",
  );

const sessionEmptyElement =
  document.getElementById(
    "session-empty",
  );

let activeSessionId =
  null;

function renderRuntimeStatus(
  status,
) {
  stateElement.textContent =
    status.state;

  dotElement.dataset.state =
    status.state;

  detailsElement.textContent =
    JSON.stringify(
      status,
      null,
      2,
    );
}

function shortSessionId(
  sessionId,
) {
  return sessionId
    .replace(
      /^sess-/,
      "",
    )
    .slice(
      0,
      8,
    );
}

function renderSessions(
  items,
) {
  sessionListElement.replaceChildren();

  sessionEmptyElement.hidden =
    items.length !==
      0;

  const sorted =
    [
      ...items,
    ].sort(
      (
        a,
        b,
      ) =>
        (
          b.updatedAt ??
          0
        ) -
        (
          a.updatedAt ??
          0
        ),
    );

  for (
    const session of
      sorted
  ) {
    const button =
      document.createElement(
        "button",
      );

    button.type =
      "button";

    button.className =
      "session-item";

    if (
      session.sessionId ===
        activeSessionId
    ) {
      button.classList.add(
        "active",
      );
    }

    const title =
      document.createElement(
        "span",
      );

    title.className =
      "session-name";

    title.textContent =
      shortSessionId(
        session.sessionId,
      );

    const status =
      document.createElement(
        "span",
      );

    status.className =
      "session-status";

    status.textContent =
      session.status ??
      "unknown";

    button.append(
      title,
      status,
    );

    button.addEventListener(
      "click",
      async () => {
        if (
          session.sessionId ===
            activeSessionId
        ) {
          return;
        }

        button.disabled =
          true;

        try {
          const resumed =
            await window
              .tongyuDesktop
              .sessions
              .resume(
                session.sessionId,
              );

          activeSessionId =
            resumed.sessionId;

          await loadSessions();
        } catch (error) {
          detailsElement.textContent =
            String(
              error,
            );
        } finally {
          button.disabled =
            false;
        }
      },
    );

    sessionListElement.appendChild(
      button,
    );
  }
}

async function loadRuntimeStatus() {
  try {
    const status =
      await window
        .tongyuDesktop
        .runtime
        .getStatus();

    renderRuntimeStatus(
      status,
    );

    if (
      status.state ===
        "running"
    ) {
      await loadSessions();
    }
  } catch (error) {
    stateElement.textContent =
      "unavailable";

    detailsElement.textContent =
      String(
        error,
      );
  }
}

async function loadSessions() {
  try {
    const result =
      await window
        .tongyuDesktop
        .sessions
        .list();

    activeSessionId =
      result.activeSessionId ??
      null;

    renderSessions(
      result.items,
    );
  } catch (error) {
    sessionListElement.replaceChildren();

    sessionEmptyElement.hidden =
      false;

    sessionEmptyElement.textContent =
      "Sessions unavailable";

    detailsElement.textContent =
      String(
        error,
      );
  }
}

window
  .tongyuDesktop
  .runtime
  .onStatus(
    (
      status,
    ) => {
      renderRuntimeStatus(
        status,
      );

      if (
        status.state ===
          "running"
      ) {
        void loadSessions();
      }
    },
  );

restartButton.addEventListener(
  "click",
  async () => {
    restartButton.disabled =
      true;

    try {
      const status =
        await window
          .tongyuDesktop
          .runtime
          .restart();

      renderRuntimeStatus(
        status,
      );

      await loadSessions();
    } finally {
      restartButton.disabled =
        false;
    }
  },
);

newSessionButton.addEventListener(
  "click",
  async () => {
    newSessionButton.disabled =
      true;

    try {
      const created =
        await window
          .tongyuDesktop
          .sessions
          .create();

      activeSessionId =
        created.sessionId;

      await loadSessions();
    } catch (error) {
      detailsElement.textContent =
        String(
          error,
        );
    } finally {
      newSessionButton.disabled =
        false;
    }
  },
);

void loadRuntimeStatus();
