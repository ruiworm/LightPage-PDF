import { useState, useCallback, Dispatch, SetStateAction } from "react";

export interface BaseParametersHook<T> {
  parameters: T;
  setParameters: Dispatch<SetStateAction<T>>;
  updateParameter: <K extends keyof T>(parameter: K, value: T[K]) => void;
  resetParameters: () => void;
  validateParameters: () => boolean;
  getEndpointName: () => string;
  /** Parameters explicitly configured before files arrive should survive selection. */
  isModified?: boolean;
}

export interface BaseParametersConfig<T> {
  defaultParameters: T;
  endpointName: string | ((params: T) => string);
  validateFn?: (params: T) => boolean;
}

export function useBaseParameters<T>(
  config: BaseParametersConfig<T>,
): BaseParametersHook<T> {
  const [parameters, setParameters] = useState<T>(config.defaultParameters);

  const updateParameter = useCallback(
    <K extends keyof T>(parameter: K, value: T[K]) => {
      setParameters((prev) => ({
        ...prev,
        [parameter]: value,
      }));
    },
    [],
  );

  const resetParameters = useCallback(() => {
    setParameters(config.defaultParameters);
  }, [config.defaultParameters]);

  const validateParameters = useCallback(() => {
    return config.validateFn ? config.validateFn(parameters) : true;
  }, [parameters, config.validateFn]);

  const getEndpointName = useCallback(() => {
    const { endpointName } = config;
    if (typeof endpointName === "string") {
      return endpointName;
    }
    return endpointName(parameters);
  }, [config.endpointName, parameters]);

  return {
    parameters,
    isModified: parameters !== config.defaultParameters,
    setParameters,
    updateParameter,
    resetParameters,
    validateParameters,
    getEndpointName,
  };
}
