import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import AssetPreview from './AssetPreview';

interface Asset {
  path: string;
  relativePath: string;
  filename: string;
  size: number;
  mtime: string;
  url: string;
}

interface VariationComparisonProps {
  scenarioKey: string;
  variations: Array<{
    slug: string;
    assets: Asset[];
    context?: any;
  }>;
}

export default function VariationComparison({ variations }: VariationComparisonProps) {
  const [selectedVariations, setSelectedVariations] = useState<string[]>(
    variations.length >= 2 ? [variations[0].slug, variations[1].slug] : variations.map(v => v.slug)
  );

  const getAssetsByCaptureKey = (variationSlug: string) => {
    const variation = variations.find(v => v.slug === variationSlug);
    if (!variation) return {};
    
    const assetsByKey: Record<string, Asset> = {};
    variation.assets.forEach(asset => {
      const captureKey = asset.filename.replace(/\.[^/.]+$/, '');
      assetsByKey[captureKey] = asset;
    });
    return assetsByKey;
  };

  const getAllCaptureKeys = () => {
    const keys = new Set<string>();
    variations.forEach(variation => {
      variation.assets.forEach(asset => {
        const captureKey = asset.filename.replace(/\.[^/.]+$/, '');
        keys.add(captureKey);
      });
    });
    return Array.from(keys);
  };

  const captureKeys = getAllCaptureKeys();

  if (variations.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No variations to compare
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Variation Comparison</CardTitle>
          <CardDescription>
            Compare assets across different variations side-by-side
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Variation selector */}
          <div className="flex flex-wrap gap-2 mb-4">
            {variations.map(variation => (
              <Button
                key={variation.slug}
                variant={selectedVariations.includes(variation.slug) ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (selectedVariations.includes(variation.slug)) {
                    if (selectedVariations.length > 1) {
                      setSelectedVariations(selectedVariations.filter(s => s !== variation.slug));
                    }
                  } else {
                    if (selectedVariations.length < 4) {
                      setSelectedVariations([...selectedVariations, variation.slug]);
                    }
                  }
                }}
              >
                {variation.slug}
                {variation.context && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {Object.keys(variation.context).length} context keys
                  </Badge>
                )}
              </Button>
            ))}
          </div>

          {/* Comparison grid */}
          {captureKeys.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No assets found for comparison
            </div>
          ) : (
            <div className="space-y-4">
              {captureKeys.map(captureKey => (
                <Card key={captureKey}>
                  <CardHeader>
                    <CardTitle className="text-sm">{captureKey}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${selectedVariations.length}, 1fr)` }}>
                      {selectedVariations.map(variationSlug => {
                        const assetsByKey = getAssetsByCaptureKey(variationSlug);
                        const asset = assetsByKey[captureKey];
                        const variation = variations.find(v => v.slug === variationSlug);

                        return (
                          <div key={variationSlug} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Badge variant="secondary">{variationSlug}</Badge>
                              {!asset && (
                                <Badge variant="outline" className="text-xs">Missing</Badge>
                              )}
                            </div>
                            {asset ? (
                              <AssetPreview
                                url={asset.url}
                                filename={asset.filename}
                                size="md"
                              />
                            ) : (
                              <div className="h-32 w-full border border-dashed rounded-md flex items-center justify-center text-muted-foreground text-sm">
                                Asset not found
                              </div>
                            )}
                            {variation?.context && (
                              <div className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded">
                                {JSON.stringify(variation.context, null, 2)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

