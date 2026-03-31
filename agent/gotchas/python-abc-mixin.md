# Python ABC / Mixin Gotchas

Cross-project traps encountered with ABCs, mixins, and multiple inheritance in Python.

- **`@abstractmethod` on non-ABC mixins doesn't propagate**: `ABCMeta.__new__` collects abstract methods from `base.__abstractmethods__`, which is only set on classes created by `ABCMeta`. A plain mixin with `@abstractmethod` won't have its abstract methods enforced on child classes. Fix: make the mixin inherit from `ABC`.
- **HuggingFace mixin pattern**: no `__init__` in mixins, use class-level attribute defaults. Avoids all cooperative `__init__` / MRO issues with nn.Module. See HF's `GenerationMixin`, `ModuleUtilsMixin`, `PushToHubMixin` — all are pure method bags with zero `__init__`.
- **ABC mixin + nn.Module MRO**: `SomeMixin(ABC)` composes cleanly with `SomeModel(nn.Module, ABC)` — `ABCMeta` is a subclass of `type`, so metaclass resolution works. Just don't list `ABC` explicitly in a class that already inherits from a `ConditionableMixin(ABC)` — that causes MRO conflict (redundant ABC).
