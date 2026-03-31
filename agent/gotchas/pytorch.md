# PyTorch Gotchas

Cross-project traps encountered when working with PyTorch.

- **Protocol + nn.Module MRO**: when a class inherits from both a `Protocol` and `nn.Module`, `nn.Module` must come first in the base list. Otherwise Protocol's `__call__` (which returns None) shadows `nn.Module.__call__` (which dispatches to `forward`). Similarly, `super().__init__()` may not reach `nn.Module.__init__()` through the Protocol — use `nn.Module.__init__(self)` explicitly.
- **0 × -inf = NaN**: one-hot matmul with a matrix containing `-inf` values produces NaN (IEEE float). Use direct tensor indexing (`matrix[indices]`) instead of `F.one_hot(indices) @ matrix`.
- **`F.one_hot()` returns LongTensor**: must call `.float()` before passing to `nn.Linear` or other float-expecting layers, otherwise `RuntimeError: mat1 and mat2 must have the same dtype`.
- **`nn.Embedding` padding_idx after manual weight assignment**: `nn.Embedding` zeros the padding row at init, but does NOT re-enforce the constraint after `.weight.data.copy_()` or similar. Always `.zero_()` the padding row explicitly after manual weight assignment.
- **`nn.Module.train()` recurses into all submodules** — calling `model.train()` on a wrapper containing a frozen pretrained model will set it to training mode (enabling dropout etc.). Override `train()` to only toggle the trainable head and explicitly call `self.frozen_model.eval()`.
- **PEFT LoRA + lazy module loading** — if a model loads submodules lazily, those params aren't covered by `apply_lora()`'s freeze. After triggering lazy load, must re-freeze all base params then re-enable `lora_` params.
- **PEFT LoRA learning rate** — LoRA-adapted large models can collapse to constant predictions with lr=1e-3. Use lr=1e-4 or lower. Consider separate optimizer param groups for LoRA vs head.
