declare module 'graphql-validation-complexity' {
  import { ValidationRule } from 'graphql';

  export interface ComplexityLimitOptions {
    scalarCost?: number;
    objectCost?: number;
    listFactor?: number;
    introspectionListFactor?: number;
    onCost?: (cost: number) => void;
    createError?: (cost: number, max: number) => Error;
    formatErrorMessage?: (cost: number, max: number) => string;
  }

  export function createComplexityLimitRule(
    maxCost: number,
    options?: ComplexityLimitOptions
  ): ValidationRule;
}
