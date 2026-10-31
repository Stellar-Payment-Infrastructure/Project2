import { NextResponse } from 'next/server';
import { createCheckout, isProductId } from '../../../lib/checkout';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { productId?: unknown } | null;
  if (!body || !isProductId(body.productId)) {
    return NextResponse.json({ error: 'unknown product' }, { status: 400 });
  }
  try {
    const { checkoutUrl } = await createCheckout(body.productId);
    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    console.error('checkout failed:', (err as Error).message);
    return NextResponse.json({ error: 'checkout unavailable' }, { status: 502 });
  }
}
