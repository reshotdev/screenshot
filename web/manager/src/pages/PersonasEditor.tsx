import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, X } from 'lucide-react';

interface PersonasEditorProps {
  contexts: Record<string, any>;
  matrix: any[][];
  onChange: (contexts: Record<string, any>, matrix: any[][]) => void;
}

export default function PersonasEditor({ contexts, matrix, onChange }: PersonasEditorProps) {
  const [editingPersona, setEditingPersona] = useState<string | null>(null);
  const [newPersonaKey, setNewPersonaKey] = useState('');
  const [newPersonaContext, setNewPersonaContext] = useState('{}');

  const personaKeys = Object.keys(contexts).filter((k) => k !== 'base');

  const handleAddPersona = () => {
    if (!newPersonaKey || !/^[a-z0-9-]+$/.test(newPersonaKey)) {
      return;
    }

    try {
      const contextValue = JSON.parse(newPersonaContext || '{}');
      const updatedContexts = {
        ...contexts,
        [newPersonaKey]: contextValue,
      };

      // Update matrix to include new persona if it's a simple single-axis matrix
      let updatedMatrix = matrix;
      if (matrix.length === 0 || (matrix.length === 1 && Array.isArray(matrix[0]))) {
        updatedMatrix = [[...personaKeys, newPersonaKey]];
      }

      onChange(updatedContexts, updatedMatrix);
      setNewPersonaKey('');
      setNewPersonaContext('{}');
    } catch (err) {
      // Invalid JSON
    }
  };

  const handleRemovePersona = (key: string) => {
    const updatedContexts = { ...contexts };
    delete updatedContexts[key];

    // Remove from matrix
    const updatedMatrix = matrix.map((row) => row.filter((k) => k !== key));

    onChange(updatedContexts, updatedMatrix);
  };

  const handleUpdatePersonaContext = (key: string, contextJson: string) => {
    try {
      const contextValue = JSON.parse(contextJson);
      const updatedContexts = {
        ...contexts,
        [key]: contextValue,
      };
      onChange(updatedContexts, matrix);
      setEditingPersona(null);
    } catch (err) {
      // Invalid JSON, ignore
    }
  };

  const handleUpdateBaseContext = (contextJson: string) => {
    try {
      const contextValue = JSON.parse(contextJson);
      const updatedContexts = {
        ...contexts,
        base: contextValue,
      };
      onChange(updatedContexts, matrix);
    } catch (err) {
      // Invalid JSON, ignore
    }
  };

  return (
    <div className="space-y-6">
      {/* Base Context */}
      <div>
        <Label>Base Context (shared by all variations)</Label>
        <Textarea
          value={JSON.stringify(contexts.base || {}, null, 2)}
          onChange={(e) => handleUpdateBaseContext(e.target.value)}
          className="font-mono text-sm min-h-[100px] mt-2"
          placeholder='{"env": "staging"}'
        />
      </div>

      {/* Personas */}
      <div>
        <Label>Personas</Label>
        <div className="space-y-3 mt-2">
          {personaKeys.map((key) => (
            <div key={key} className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="secondary">{key}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemovePersona(key)}
                  className="h-6 w-6 p-0 text-destructive"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {editingPersona === key ? (
                <div className="space-y-2">
                  <Textarea
                    value={JSON.stringify(contexts[key] || {}, null, 2)}
                    onChange={(e) => {
                      try {
                        handleUpdatePersonaContext(key, e.target.value);
                      } catch (err) {
                        // Invalid JSON, allow typing
                      }
                    }}
                    className="font-mono text-sm min-h-[80px]"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setEditingPersona(null)}>
                      Done
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded">
                    {JSON.stringify(contexts[key] || {}, null, 2)}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingPersona(key)}
                    className="mt-2"
                  >
                    Edit
                  </Button>
                </div>
              )}
            </div>
          ))}

          {/* Add new persona */}
          <div className="border border-dashed rounded-md p-3 space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="persona-key"
                value={newPersonaKey}
                onChange={(e) => setNewPersonaKey(e.target.value)}
                className="font-mono text-sm"
              />
              <Button size="sm" onClick={handleAddPersona}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              placeholder='{"role": "admin"}'
              value={newPersonaContext}
              onChange={(e) => setNewPersonaContext(e.target.value)}
              className="font-mono text-sm min-h-[60px]"
            />
          </div>
        </div>
      </div>

      {/* Matrix preview */}
      {matrix.length > 0 && (
        <div>
          <Label>Variation Matrix</Label>
          <div className="mt-2 text-sm text-muted-foreground">
            <p>Current matrix generates {matrix.reduce((acc, row) => acc * (row.length || 1), 1)} variation(s)</p>
            <div className="mt-2 space-y-1">
              {matrix.map((row, i) => (
                <div key={i} className="flex gap-1 flex-wrap">
                  {row.map((key) => (
                    <Badge key={key} variant="outline" className="text-xs">
                      {key}
                    </Badge>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


