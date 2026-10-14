import { useId, useState } from "react";
import { TextInput } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import {
  useCardLicense,
  useOptionalCardLicense,
} from "@app/contexts/CardLicenseContext";
import {
  cardLicenseRemaining,
  formatCardMachineId,
  maskCardLicense,
  type CardLicenseStatus,
} from "@app/services/cardLicenseService";
import "@app/components/license/CardLicensePanel.css";

interface CardLicensePanelProps {
  status: CardLicenseStatus | null;
  ready: boolean;
  busy: boolean;
  error: string;
  activate: (key?: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  clear: () => Promise<void>;
}

function expiryText(status: CardLicenseStatus | null): string {
  const remaining = cardLicenseRemaining(status);
  if (remaining?.kind === "permanent") return "永久授权";
  if (remaining?.kind === "expired") return "授权已到期";
  if (!status?.expiresAt) return "尚未激活";
  const date = new Date(status.expiresAt * 1000).toLocaleString("zh-CN", {
    hour12: false,
  });
  return `${date} 到期`;
}

/** Shared activation form for the startup gate and desktop settings. Card input is never persisted by React. */
export function CardLicensePanel({
  status,
  ready,
  busy,
  error,
  activate,
  refresh,
  clear,
}: CardLicensePanelProps) {
  const id = useId();
  const [key, setKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const activated = status?.activated === true;

  async function copyMachineId() {
    if (!status?.machineId) return;
    try {
      await navigator.clipboard.writeText(status.machineId);
      setCopied(true);
      setCopyError("");
    } catch {
      setCopyError("复制失败，请手动选中机器码复制");
    }
  }

  return (
    <section className="card-license-panel" aria-labelledby={`${id}-title`}>
      <div className="card-license-heading">
        <Icon name="shield-check" size={20} />
        <h2 id={`${id}-title`}>卡密授权</h2>
        <span className="card-license-status" data-active={activated}>
          {!ready ? "正在检查" : activated ? "已激活" : "未激活"}
        </span>
      </div>
      <p className="card-license-description">
        使用轻页 PDF 专用卡密激活本机。激活后，有效期内可离线使用。
      </p>
      {activated && (
        <div className="card-license-summary">
          <span>{maskCardLicense(status.licenseKey)}</span>
          <span>{expiryText(status)}</span>
        </div>
      )}
      {!activated && ready && status?.message && (
        <p className="card-license-message">{status.message}</p>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (key.trim() && (await activate(key))) setKey("");
        }}
        className="card-license-form"
      >
        <TextInput
          label={activated ? "更换卡密" : "卡密"}
          placeholder="输入轻页 PDF 卡密"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(event) => setKey(event.currentTarget.value)}
          disabled={!ready || busy}
          maxLength={512}
        />
        <Button
          type="submit"
          accent="neutral"
          loading={busy}
          disabled={!ready || !key.trim() || busy}
        >
          {activated ? "更换卡密" : "联网激活"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="card-license-error">
          {error}
        </p>
      )}
      {status?.source === "offline" && !error && (
        <p role="status" className="card-license-message">
          {status.message}
        </p>
      )}
      {status?.machineId && (
        <div className="card-license-machine">
          <span>本机机器码</span>
          <code>{formatCardMachineId(status.machineId)}</code>
          <Button
            variant="quiet"
            onClick={() => void copyMachineId()}
            leftSection={<Icon name="copy" size={15} />}
          >
            {copied ? "已复制" : "复制"}
          </Button>
        </div>
      )}
      {copyError && (
        <p role="alert" className="card-license-error">
          {copyError}
        </p>
      )}
      <div className="card-license-actions">
        {!status && ready && (
          <Button
            variant="secondary"
            onClick={() => void refresh()}
            disabled={busy}
          >
            重新检查本机授权
          </Button>
        )}
        {activated && (
          <Button
            variant="quiet"
            onClick={() => void activate()}
            disabled={busy}
          >
            联网复验
          </Button>
        )}
        {activated && !confirmClear && (
          <Button
            variant="quiet"
            onClick={() => setConfirmClear(true)}
            disabled={busy}
          >
            清除本机授权
          </Button>
        )}
        {activated && confirmClear && (
          <>
            <span>清除后需要重新输入卡密</span>
            <Button
              variant="secondary"
              accent="danger"
              onClick={() => void clear()}
              disabled={busy}
            >
              确认清除
            </Button>
            <Button
              variant="quiet"
              onClick={() => setConfirmClear(false)}
              disabled={busy}
            >
              取消
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/** Desktop-only authorization settings; web development has no hardware-bound license. */
export function CardLicenseSettings() {
  const license = useOptionalCardLicense();
  return license?.supported ? <CardLicensePanel {...license} /> : null;
}

/** Keeps the existing workbench inaccessible until local signature verification succeeds. */
export function CardLicenseGate({ children }: { children: React.ReactNode }) {
  const license = useCardLicense();
  if (!license.supported || (license.ready && license.status?.activated))
    return children;
  return (
    <main className="card-license-gate">
      <div className="card-license-gate-content">
        <h1>轻页 PDF</h1>
        {!license.ready ? (
          <p role="status">正在检查本机授权…</p>
        ) : (
          <CardLicensePanel {...license} />
        )}
      </div>
    </main>
  );
}
