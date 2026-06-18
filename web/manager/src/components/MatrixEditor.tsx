import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Trash2 } from 'lucide-react';

interface MatrixEditorProps {
  contexts: Record<string, any>;
  matrix: any[][];
  onChange: (matrix: any[][]) => void;
}

export default function MatrixEditor({ contexts, matrix, onChange }: MatrixEditorProps) {
  const personaKeys = Object.keys(contexts).filter((k) => k !== 'base');

  const handleAddRow = () => {
    const newRow = personaKeys.length > 0 ? [personaKeys[0]] : [];
    onChange([...matrix, newRow]);
  };

  const handleRemoveRow = (rowIndex: number) => {
    const newMatrix = matrix.filter((_, i) => i !== rowIndex);
    onChange(newMatrix);
  };

  const handleAddPersonaToRow = (rowIndex: number) => {
    const row = matrix[rowIndex] || [];
    const availablePersonas = personaKeys.filter((p) => !row.includes(p));
    if (availablePersonas.length > 0) {
      const newRow = [...row, availablePersonas[0]];
      const newMatrix = [...matrix];
      newMatrix[rowIndex] = newRow;
      onChange(newMatrix);
    }
  };

  const handleRemovePersonaFromRow = (rowIndex: number, personaIndex: number) => {
    const row = [...matrix[rowIndex]];
    row.splice(personaIndex, 1);
    const newMatrix = [...matrix];
    newMatrix[rowIndex] = row.length > 0 ? row : [personaKeys[0] || ''];
    onChange(newMatrix);
  };

  const handleChangePersonaInRow = (rowIndex: number, personaIndex: number, newPersona: string) => {
    const row = [...matrix[rowIndex]];
    row[personaIndex] = newPersona;
    const newMatrix = [...matrix];
    newMatrix[rowIndex] = row;
    onChange(newMatrix);
  };

  // Calculate total variations
  const totalVariations = matrix.reduce((acc, row) => acc * (row.length || 1), 1) || 0;

  // Generate variation slugs preview
  const generateVariationSlugs = () => {
    if (matrix.length === 0) return [];
    
    // Simple cartesian product for first row only (for preview)
    if (matrix[0] && matrix[0].length > 0) {
      return matrix[0].map((key: string) => key);
    }
    return [];
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>Variation Matrix</Label>
          <p className="text-xs text-muted-foreground mt-1">
            {totalVariations} variation(s) will be generated
          </p>
        </div>
        <Button size="sm" onClick={handleAddRow} variant="outline">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Row
        </Button>
      </div>

      {personaKeys.length === 0 ? (
        <div className="text-sm text-muted-foreground p-4 border rounded-md bg-muted/50">
          Add personas in the Personas section first
        </div>
      ) : (
        <div className="space-y-2">
          {matrix.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="flex items-center gap-2 p-3 border rounded-md bg-card"
            >
              <div className="flex-1 flex items-center gap-2 flex-wrap">
                {row.map((personaKey, personaIndex) => (
                  <div key={personaIndex} className="flex items-center gap-1">
                    <select
                      value={personaKey}
                      onChange={(e) =>
                        handleChangePersonaInRow(rowIndex, personaIndex, e.target.value)
                      }
                      className="h-8 px-2 text-sm border rounded-md bg-background"
                    >
                      {personaKeys.map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </select>
                    {row.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleRemovePersonaFromRow(rowIndex, personaIndex)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAddPersonaToRow(rowIndex)}
                  className="h-8"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveRow(rowIndex)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {matrix.length === 0 && (
            <div className="text-center text-muted-foreground p-4 border border-dashed rounded-md">
              <p className="text-sm mb-2">No matrix rows yet</p>
              <Button size="sm" onClick={handleAddRow} variant="outline">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add First Row
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Variation preview */}
      {totalVariations > 0 && totalVariations <= 20 && (
        <div className="mt-4 p-3 border rounded-md bg-muted/30">
          <Label className="text-xs text-muted-foreground">Variation Preview</Label>
          <div className="mt-2 flex flex-wrap gap-1">
            {generateVariationSlugs().map((slug, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {slug}
              </Badge>
            ))}
            {totalVariations > generateVariationSlugs().length && (
              <Badge variant="outline" className="text-xs">
                +{totalVariations - generateVariationSlugs().length} more
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

