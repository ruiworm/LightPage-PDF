import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import FileRedactionRestore from "@app/components/tools/redact/FileRedactionRestore";

const restore = vi.hoisted(() => vi.fn());
vi.mock("@app/services/fileRedaction/recovery", () => ({
  restoreAliasFiles: restore,
}));
beforeEach(() => vi.clearAllMocks());

async function setup() {
  const user = userEvent.setup();
  const view = render(
    <MantineProvider>
      <FileRedactionRestore />
    </MantineProvider>,
  );
  await user.click(screen.getByText("fileRedaction.restore.title"));
  const inputs =
    view.container.querySelectorAll<HTMLInputElement>('input[type="file"]');
  const recovery = new File(["recovery"], "data.lp-restore");
  const redacted = new File(["redacted"], "document.pdf", {
    type: "application/pdf",
  });
  await user.upload(inputs[0], recovery);
  await user.upload(inputs[1], redacted);
  return { user, recovery, redacted, inputs };
}

it("restores selected files without requiring an active scan and clears old downloads when inputs change", async () => {
  restore.mockResolvedValue([new File(["original"], "original.pdf")]);
  const { user, recovery, redacted, inputs } = await setup();
  await user.click(
    screen.getByRole("button", { name: "fileRedaction.restore.run" }),
  );
  await waitFor(() =>
    expect(restore).toHaveBeenCalledWith(recovery, [redacted]),
  );
  const link = await screen.findByRole("link", {
    name: "fileRedaction.restore.download",
  });
  expect(link).toHaveAttribute("download", "original.pdf");
  expect(link).toHaveAttribute("href", "mocked-url");
  await user.upload(
    inputs[1],
    new File(["different"], "other.pdf", { type: "application/pdf" }),
  );
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("mocked-url");
});

it("reports mismatched files without offering a restored download", async () => {
  restore.mockRejectedValue(new Error("RECOVERY_MISMATCH"));
  const { user } = await setup();
  await user.click(
    screen.getByRole("button", { name: "fileRedaction.restore.run" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "fileRedaction.restore.mismatch",
  );
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
