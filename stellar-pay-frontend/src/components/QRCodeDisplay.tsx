import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

export interface QRCodeDisplayProps {
  /** What to encode. Default use: the hosted checkout URL (works with any camera). */
  value: string;
  size?: number;
  /** Accessible description of the code. */
  label?: string;
  /** Show the encoded value as text under the code. */
  showValue?: boolean;
  className?: string;
}

/** Renders a QR code as an <img> with a text alternative. */
export function QRCodeDisplay({ value, size = 200, label = 'QR code for this payment', showValue = false, className }: QRCodeDisplayProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((url: string) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <figure className={['sp-qr', className].filter(Boolean).join(' ')} style={{ margin: 0 }}>
      {failed ? (
        <p className="sp-alert sp-alert--error" role="alert">
          Could not render the QR code. Use the link instead.
        </p>
      ) : src ? (
        <img src={src} width={size} height={size} alt={label} />
      ) : (
        <div className="sp-skeleton" style={{ width: size, height: size }} role="status" aria-label="Generating QR code" />
      )}
      {showValue && (
        <figcaption className="sp-muted sp-mono" style={{ maxWidth: size }}>
          {value}
        </figcaption>
      )}
    </figure>
  );
}
