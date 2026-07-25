/**
 * One class, one operation (Single Responsibility).
 *
 * Every user-facing action is a use case with exactly one public method. This
 * keeps controllers thin, makes each operation independently testable, and means
 * a class has one reason to change. When a use case starts needing "and also…",
 * that is the signal to emit a domain event instead of adding a branch.
 */
export interface IUseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
