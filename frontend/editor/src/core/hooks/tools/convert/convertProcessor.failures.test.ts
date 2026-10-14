import { beforeEach, describe, expect, it, vi } from "vitest";
import { convertProcessor } from "@app/hooks/tools/convert/useConvertOperation";
import { defaultParameters } from "@app/hooks/tools/convert/useConvertParameters";

const post = vi.hoisted(() => vi.fn());
vi.mock("@app/services/apiClient", () => ({ default: { post } }));

const parameters = {
  ...defaultParameters,
  fromExtension: "any",
  toExtension: "pdf",
  isSmartDetection: true,
  smartDetectionType: "mixed" as const,
};
const files = [
  new File(["one"], "same.txt"),
  new File(["two"], "same.docx"),
  new File(["three"], "same.xyz"),
];
const response = () => ({ data: new Blob(["%PDF-output"]), headers: {} });

beforeEach(() => {
  post.mockReset();
});

describe("separate conversion failures", () => {
  it.each([0, 1, 2])(
    "keeps all other outputs when input %i fails, including later outputs",
    async (index) => {
      const error = new Error("broken input");
      let calls = 0;
      post.mockImplementation(async () => {
        if (calls++ === index) throw error;
        return response();
      });
      const result = await convertProcessor(parameters, files);
      expect(result.files).toHaveLength(2);
      expect(result.successfulInputs).toEqual(
        files.filter((_, input) => input !== index),
      );
      expect(result.failedInputs).toEqual([{ file: files[index], error }]);
      expect(result.unprocessedInputs).toEqual([]);
      expect(post).toHaveBeenCalledTimes(3);
    },
  );

  it("rejects a run with no successful outputs and names every failed input", async () => {
    post.mockRejectedValue(new Error("corrupt"));
    const error = await convertProcessor(parameters, files).catch(
      (error) => error,
    );
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toHaveLength(3);
    files.forEach((file) =>
      expect(error.message).toContain(`${file.name}: corrupt`),
    );
    expect(post).toHaveBeenCalledTimes(3);
  });

  it("treats a 200 response with an empty payload as a per-input failure", async () => {
    post
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce({ data: new Blob(), headers: {} })
      .mockResolvedValueOnce(response());
    const result = await convertProcessor(parameters, files);
    expect(result.successfulInputs).toEqual([files[0], files[2]]);
    expect(result.failedInputs?.[0].file).toBe(files[1]);
    expect(result.failedInputs?.[0].error).toMatchObject({
      message: "Conversion returned an empty output",
    });
  });

  it.each([
    { response: { status: 401, data: { error: "SIGNUP_REQUIRED" } } },
    { name: "CanceledError", code: "ERR_CANCELED" },
  ])(
    "stops at a gate/cancellation and retains earlier results without marking untouched inputs failed",
    async (error) => {
      post.mockResolvedValueOnce(response()).mockRejectedValueOnce(error);
      const result = await convertProcessor(parameters, files);
      expect(result.files).toHaveLength(1);
      expect(result.successfulInputs).toEqual([files[0]]);
      expect(result.failedInputs).toEqual([]);
      expect(result.unprocessedInputs).toEqual(files.slice(1));
      expect(post).toHaveBeenCalledTimes(2);
    },
  );

  it("propagates an account gate before any success", async () => {
    const error = {
      response: { status: 401, data: { error: "SIGNUP_REQUIRED" } },
    };
    post.mockRejectedValue(error);
    await expect(convertProcessor(parameters, files)).rejects.toBe(error);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
