import { UseSettingsReturn } from "@/types";
import { useCustomAiProviders } from "@/hooks";
import { CreateEditProvider } from "./CreateEditProvider";
import { CustomProviderRows } from "../CustomProviderRows";

export const CustomProviders = ({ allAiProviders }: UseSettingsReturn) => {
  const customProviderHook = useCustomAiProviders();

  return (
    <CustomProviderRows
      idPrefix="ai"
      providers={allAiProviders}
      hook={customProviderHook}
      form={<CreateEditProvider customProviderHook={customProviderHook} />}
    />
  );
};
