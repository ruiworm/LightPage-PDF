import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CardLicensePanel } from "@app/components/license/CardLicensePanel";
import type { CardLicenseStatus } from "@app/services/cardLicenseService";

const activate = vi.fn();
const refresh = vi.fn();
const clear = vi.fn();
const status: CardLicenseStatus = {
  activated: false,
  licenseKey: "",
  machineId: "FAKE0000DEVICE0000",
  expiresAt: null,
  permanent: false,
  lastVerifiedAt: null,
  message: "请输入轻页 PDF 卡密",
  source: "none",
};

function panel(
  overrides: Partial<Parameters<typeof CardLicensePanel>[0]> = {},
) {
  return render(
    <MantineProvider>
      <CardLicensePanel
        status={status}
        ready
        busy={false}
        error=""
        activate={activate}
        refresh={refresh}
        clear={clear}
        {...overrides}
      />
    </MantineProvider>,
  );
}

beforeEach(() => {
  activate.mockReset();
  refresh.mockReset();
  clear.mockReset();
});

describe("card activation controls", () => {
  it("requires a nonempty card and submits it without exposing the input", async () => {
    activate.mockResolvedValue(true);
    panel();
    const input = screen.getByLabelText("卡密");
    expect(input).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "联网激活" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "TEST-ONLY" } });
    fireEvent.click(screen.getByRole("button", { name: "联网激活" }));
    await waitFor(() => expect(activate).toHaveBeenCalledWith("TEST-ONLY"));
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("keeps a failed card visible for correction and displays a useful error", async () => {
    activate.mockResolvedValue(false);
    panel({ error: "该卡密不属于轻页 PDF" });
    fireEvent.change(screen.getByLabelText("卡密"), {
      target: { value: "WRONG-CARD" },
    });
    fireEvent.click(screen.getByRole("button", { name: "联网激活" }));
    await waitFor(() => expect(activate).toHaveBeenCalled());
    expect(screen.getByLabelText("卡密")).toHaveValue("WRONG-CARD");
    expect(screen.getByRole("alert")).toHaveTextContent("该卡密不属于轻页 PDF");
  });

  it("requires explicit clearing confirmation and masks the saved card", () => {
    panel({
      status: {
        ...status,
        activated: true,
        permanent: true,
        licenseKey: "TEST-CARD-123456789",
      },
    });
    expect(screen.queryByText("TEST-CARD-123456789")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "清除本机授权" }));
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认清除" }));
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
