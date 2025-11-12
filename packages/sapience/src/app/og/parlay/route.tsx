import { ImageResponse } from 'next/og';
import { og } from '../_shared';
import {
  WIDTH,
  HEIGHT,
  getScale,
  normalizeText,
  loadFontData,
  fontsFromData,
  commonAssets,
  Background,
  Footer,
  baseContainerStyle,
  contentContainerStyle,
  addThousandsSeparators,
  Pill,
  PredictionsLabel,
  computePotentialReturn,
} from '../_shared';

export const runtime = 'edge';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    if (searchParams.has('debug')) {
      return new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    }

    const wagerRaw = normalizeText(searchParams.get('wager'), 32);
    const payoutRaw = normalizeText(searchParams.get('payout'), 32);
    const wager = addThousandsSeparators(wagerRaw);
    const payout = addThousandsSeparators(payoutRaw);
    const symbol = normalizeText(searchParams.get('symbol'), 16);
    // Anti-parlay flag to change label to "Prediction Against"
    const antiParam = normalizeText(searchParams.get('anti'), 16).toLowerCase();
    const isAntiParlay = ['1', 'true', 'yes', 'anti', 'against'].includes(
      antiParam
    );
    // SettledWon flag to show "Won" instead of "To Win" (parlay has been settled and won)
    const settledWonParam = normalizeText(searchParams.get('settledWon'), 16).toLowerCase();
    const isSettledWon = ['1', 'true', 'yes', 'settledwon'].includes(settledWonParam);

    // Validate and normalize Ethereum address (optional)
    const rawAddr = (searchParams.get('addr') || '').toString();
    const cleanedAddr = rawAddr.replace(/\s/g, '').toLowerCase();
    const addr = /^0x[a-f0-9]{40}$/.test(cleanedAddr) ? cleanedAddr : '';

    // Shared assets and fonts
    const { bgUrl } = commonAssets(req);

    // Parse legs passed as repeated `leg` params: text|Yes or text|No
    const rawLegs = searchParams.getAll('leg').slice(0, 12); // safety cap
    const legs = rawLegs
      .map((entry) => entry.split('|'))
      .map(([text, choice]) => ({
        text: normalizeText(text || '', 120),
        choice: (choice || '').toLowerCase() === 'yes' ? 'Yes' : 'No',
      }))
      .filter((l) => l.text);

    const fonts = await loadFontData(req);

    const width = WIDTH;
    const height = HEIGHT;
    const scale = getScale(width);
    // Note: next/og ImageResponse custom headers can cause non-image responses for next/image fetch.
    // Skip attaching headers directly to ImageResponse to ensure proper content-type.

    const potentialReturn = computePotentialReturn(wager, payout);

    return new ImageResponse(
      (
        <div style={baseContainerStyle()}>
          <Background bgUrl={bgUrl} scale={scale} />

          <div style={contentContainerStyle(scale)}>
            <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  gap: 28 * scale,
                  alignItems: 'stretch',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16 * scale,
                    flex: 1,
                  }}
                >
                  <PredictionsLabel
                    scale={scale}
                    count={legs.length}
                    against={isAntiParlay}
                  />
                  {legs.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12 * scale,
                      }}
                    >
                      {legs
                        .slice(0, Math.min(legs.length, 5))
                        .map((leg, idx) => {
                          const showAndMore = legs.length > 5 && idx === 4;
                          if (showAndMore) {
                            return (
                              <div
                                key="and-more"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 16 * scale,
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    fontSize: 20 * scale,
                                    lineHeight: `${24 * scale}px`,
                                    fontWeight: 600,
                                    color: og.colors.mutedWhite64,
                                    fontFamily:
                                      'IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                  }}
                                >
                                  and more...
                                </div>
                              </div>
                            );
                          }
                          const isYes = leg.choice === 'Yes';
                          return (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16 * scale,
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  fontSize: 38 * scale,
                                  lineHeight: `${48 * scale}px`,
                                  fontWeight: 700,
                                  letterSpacing: -0.16 * scale,
                                  color: og.colors.brandWhite,
                                  fontFamily:
                                    'IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                }}
                              >
                                {leg.text}
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                              >
                                <Pill
                                  text={leg.choice}
                                  tone={isYes ? 'success' : 'danger'}
                                  scale={scale}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Footer
              addr={addr}
              wager={wager}
              payout={payout}
              symbol={symbol}
              potentialReturn={potentialReturn}
              scale={scale}
              showReturn={false}
              forceToWinGreen={true}
              settledWon={isSettledWon}
            />
          </div>
        </div>
      ),
      {
        width,
        height,
        fonts: fontsFromData(fonts),
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: og.colors.backgroundDark,
            color: og.colors.foregroundLight,
            fontFamily:
              'AvenirNextRounded, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto',
          }}
        >
          <div style={{ display: 'flex', fontSize: 28, opacity: 0.86 }}>
            Error: {message}
          </div>
        </div>
      ),
      { width: WIDTH, height: HEIGHT }
    );
  }
}
