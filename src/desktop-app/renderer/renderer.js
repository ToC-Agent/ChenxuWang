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
  } catch (error) {
    stateElement.textContent =
      "unavailable";

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
    } finally {
      restartButton.disabled =
        false;
    }
  },
);

void loadRuntimeStatus();
