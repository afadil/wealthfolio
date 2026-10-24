import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAccounts, listImportTemplates, saveImportTemplate } from "@/adapters";
import { ImportFormat } from "@/lib/constants";
import type { ImportTemplateData } from "@/lib/types";
import {
  ImportProvider,
  setMapping,
  setParsedData,
  setSelectedTemplate,
  useImportContext,
} from "../context";
import {
  createDefaultActivityMapping,
  createDefaultActivityTemplate,
} from "../utils/default-activity-template";
import { MappingStepUnified } from "./mapping-step-unified";

vi.mock("@/adapters", () => ({
  getAccounts: vi.fn(),
  listImportTemplates: vi.fn(),
  saveImportTemplate: vi.fn(),
  saveAccountImportMapping: vi.fn(),
  deleteImportTemplate: vi.fn(),
}));
vi.mock("../components/mapping-table", () => ({ MappingTable: () => null }));
vi.mock("../components/csv-file-viewer", () => ({ CSVFileViewer: () => null }));
vi.mock("../components/template-picker", () => ({ TemplatePicker: () => null }));

const originalCrypto = globalThis.crypto;
const existingId = "legacy-user-template";

function SeedMapping({ template }: { template?: ImportTemplateData }) {
  const { state, dispatch } = useImportContext();

  useEffect(() => {
    dispatch(
      setMapping({
        ...createDefaultActivityMapping("account-1"),
        name: "My CSV template",
        fieldMappings: { [ImportFormat.DATE]: "Date", [ImportFormat.AMOUNT]: "Amount" },
        symbolMappings: { "My symbol": "AAPL" },
      }),
    );
    dispatch(setParsedData(["Date", "Amount"], [["2026-10-01", "100"]]));
    if (template) dispatch(setSelectedTemplate(template.id, template.scope));
  }, [dispatch, template]);

  return state.parsedRows.length > 0 ? (
    <>
      <MappingStepUnified />
      <output data-testid="selected-template">{state.selectedTemplateId}</output>
    </>
  ) : null;
}

function renderMapping(template?: ImportTemplateData) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ImportProvider initialAccountId="account-1">
        <SeedMapping template={template} />
      </ImportProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe.each(["missing randomUUID", "missing crypto"])("template saving with %s", (mode) => {
  beforeEach(() => {
    vi.stubGlobal(
      "crypto",
      mode === "missing crypto"
        ? undefined
        : { getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto) },
    );
    vi.mocked(getAccounts).mockResolvedValue([]);
    vi.mocked(listImportTemplates).mockResolvedValue([]);
    vi.mocked(saveImportTemplate).mockReset();
    vi.mocked(saveImportTemplate).mockImplementation(async (template) => template);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    { selection: "empty", template: undefined },
    { selection: "system", template: createDefaultActivityTemplate() },
  ])("saves a new user template when the selection is $selection", async ({ template }) => {
    const user = renderMapping(template);
    await user.click(screen.getByRole("button", { name: "Save Template" }));

    await waitFor(() => expect(saveImportTemplate).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(saveImportTemplate).mock.calls[0][0];
    expect(saved.id).toMatch(/^[A-Za-z0-9_-]{21}$/);
    expect(saved.id).not.toBe(template?.id);
    expect(saved).toMatchObject({
      name: "My CSV template",
      scope: "USER",
      fieldMappings: { [ImportFormat.DATE]: "Date", [ImportFormat.AMOUNT]: "Amount" },
      symbolMappings: { "My symbol": "AAPL" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("selected-template")).toHaveTextContent(saved.id),
    );
  });

  it("preserves the selected user template ID when updating", async () => {
    const user = renderMapping({
      ...createDefaultActivityTemplate(),
      id: existingId,
      scope: "USER",
    });
    await user.click(screen.getByRole("button", { name: "Update Template" }));

    await waitFor(() => expect(saveImportTemplate).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveImportTemplate).mock.calls[0][0].id).toBe(existingId);
    expect(screen.getByTestId("selected-template")).toHaveTextContent(existingId);
  });

  it("generates a fresh ID each time Save as New is used", async () => {
    const user = renderMapping({
      ...createDefaultActivityTemplate(),
      id: existingId,
      scope: "USER",
    });
    await user.click(screen.getByRole("button", { name: "Save as New" }));

    await waitFor(() => expect(saveImportTemplate).toHaveBeenCalledTimes(1));
    const firstId = vi.mocked(saveImportTemplate).mock.calls[0][0].id;
    expect(firstId).toMatch(/^[A-Za-z0-9_-]{21}$/);
    expect(firstId).not.toBe(existingId);
    await waitFor(() => expect(screen.getByTestId("selected-template")).toHaveTextContent(firstId));

    await user.click(screen.getByRole("button", { name: "Save as New" }));
    await waitFor(() => expect(saveImportTemplate).toHaveBeenCalledTimes(2));
    const secondId = vi.mocked(saveImportTemplate).mock.calls[1][0].id;
    expect(secondId).toMatch(/^[A-Za-z0-9_-]{21}$/);
    expect(secondId).not.toBe(firstId);
    expect(secondId).not.toBe(existingId);
  });
});
