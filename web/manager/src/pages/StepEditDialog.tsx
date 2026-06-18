import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import AssetPreview from '@/components/AssetPreview';

interface StepEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: any | null;
  onSave: (step: any) => void;
  assetUrl?: string;
}

const STEP_ACTIONS = [
  'goto',
  'click',
  'type',
  'hover',
  'wait',
  'waitForSelector',
  'screenshot',
  'clip',
];

export default function StepEditDialog({ open, onOpenChange, step, onSave, assetUrl }: StepEditDialogProps) {
  const [stepData, setStepData] = useState<any>({
    action: 'click',
    selector: '',
    key: '',
    text: '',
    url: '',
    ms: '',
    duration: '',
    clip: null,
    selectorPadding: null,
    deviceScaleFactor: null,
    path: '',
    order: 0,
  });

  useEffect(() => {
    if (step) {
      setStepData({ ...stepData, ...step });
    } else {
      setStepData({
        action: 'click',
        selector: '',
        key: '',
        text: '',
        url: '',
        ms: '',
        duration: '',
        clip: null,
        selectorPadding: null,
        deviceScaleFactor: null,
        path: '',
        order: 0,
      });
    }
  }, [step, open]);

  const handleSave = () => {
    // Clean up empty fields
    const cleaned: any = { action: stepData.action };
    
    if (stepData.selector) cleaned.selector = stepData.selector;
    if (stepData.key) cleaned.key = stepData.key;
    if (stepData.text) cleaned.text = stepData.text;
    if (stepData.url) cleaned.url = stepData.url;
    if (stepData.ms) cleaned.ms = parseInt(stepData.ms, 10);
    if (stepData.duration) cleaned.duration = parseInt(stepData.duration, 10);
    if (stepData.path) cleaned.path = stepData.path;
    if (stepData.order !== undefined) cleaned.order = stepData.order;
    
    if (stepData.clip) {
      try {
        cleaned.clip = typeof stepData.clip === 'string' ? JSON.parse(stepData.clip) : stepData.clip;
      } catch (e) {
        // Invalid JSON, skip
      }
    }
    
    if (stepData.selectorPadding !== null && stepData.selectorPadding !== '') {
      cleaned.selectorPadding = parseInt(stepData.selectorPadding, 10);
    }
    
    if (stepData.deviceScaleFactor !== null && stepData.deviceScaleFactor !== '') {
      cleaned.deviceScaleFactor = parseFloat(stepData.deviceScaleFactor);
    }

    onSave(cleaned);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{step ? 'Edit Step' : 'Add Step'}</DialogTitle>
          <DialogDescription>
            Configure the step action and parameters
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="action">Action</Label>
            <select
              id="action"
              value={stepData.action}
              onChange={(e) => setStepData({ ...stepData, action: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {STEP_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>

          {(stepData.action === 'click' || stepData.action === 'type' || stepData.action === 'hover' || stepData.action === 'waitForSelector' || stepData.action === 'screenshot') && (
            <div>
              <Label htmlFor="selector">Selector</Label>
              <Input
                id="selector"
                value={stepData.selector || ''}
                onChange={(e) => setStepData({ ...stepData, selector: e.target.value })}
                placeholder="#id, .class, [data-testid]"
              />
            </div>
          )}

          {stepData.action === 'type' && (
            <div>
              <Label htmlFor="text">Text</Label>
              <Input
                id="text"
                value={stepData.text || ''}
                onChange={(e) => setStepData({ ...stepData, text: e.target.value })}
                placeholder="Text to type"
              />
            </div>
          )}

          {stepData.action === 'goto' && (
            <div>
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                value={stepData.url || ''}
                onChange={(e) => setStepData({ ...stepData, url: e.target.value })}
                placeholder="https://example.com"
              />
            </div>
          )}

          {stepData.action === 'wait' && (
            <>
              <div>
                <Label htmlFor="ms">Milliseconds</Label>
                <Input
                  id="ms"
                  type="number"
                  value={stepData.ms || ''}
                  onChange={(e) => setStepData({ ...stepData, ms: e.target.value })}
                  placeholder="1000"
                />
              </div>
              <div>
                <Label htmlFor="duration">Duration (alternative)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={stepData.duration || ''}
                  onChange={(e) => setStepData({ ...stepData, duration: e.target.value })}
                  placeholder="1000"
                />
              </div>
            </>
          )}

          {(stepData.action === 'screenshot' || stepData.action === 'clip') && (
            <>
              {assetUrl && (
                <div>
                  <Label>Asset Preview</Label>
                  <div className="mt-2">
                    <AssetPreview
                      url={assetUrl}
                      filename={stepData.path || `${stepData.key || 'asset'}.png`}
                      size="md"
                    />
                  </div>
                </div>
              )}
              <div>
                <Label htmlFor="key">Key</Label>
                <Input
                  id="key"
                  value={stepData.key || ''}
                  onChange={(e) => setStepData({ ...stepData, key: e.target.value })}
                  placeholder="capture-key"
                />
              </div>
              <div>
                <Label htmlFor="path">Path</Label>
                <Input
                  id="path"
                  value={stepData.path || ''}
                  onChange={(e) => setStepData({ ...stepData, path: e.target.value })}
                  placeholder="screenshot.png"
                />
              </div>
              <div>
                <Label htmlFor="clip">Clip (JSON)</Label>
                <Textarea
                  id="clip"
                  value={typeof stepData.clip === 'object' ? JSON.stringify(stepData.clip, null, 2) : (stepData.clip || '')}
                  onChange={(e) => setStepData({ ...stepData, clip: e.target.value })}
                  placeholder='{"x": 0, "y": 0, "width": 800, "height": 600}'
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label htmlFor="selectorPadding">Selector Padding</Label>
                <Input
                  id="selectorPadding"
                  type="number"
                  value={stepData.selectorPadding || ''}
                  onChange={(e) => setStepData({ ...stepData, selectorPadding: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="deviceScaleFactor">Device Scale Factor</Label>
                <Input
                  id="deviceScaleFactor"
                  type="number"
                  step="0.1"
                  value={stepData.deviceScaleFactor || ''}
                  onChange={(e) => setStepData({ ...stepData, deviceScaleFactor: e.target.value })}
                  placeholder="1.0"
                />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="order">Order</Label>
            <Input
              id="order"
              type="number"
              value={stepData.order || 0}
              onChange={(e) => setStepData({ ...stepData, order: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {step ? 'Update' : 'Add'} Step
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

