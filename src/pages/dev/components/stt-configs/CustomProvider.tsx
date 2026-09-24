import { UseSettingsReturn } from "@/types";
import { useCustomSttProviders } from "@/hooks";
import { CreateEditProvider } from "./CreateEditProvider";
import { CustomProviderRows } from "../CustomProviderRows";

export const CustomProviders = ({ allSttProviders }: UseSettingsReturn) => {
  const customProviderHook = useCustomSttProviders();

  return (
    <CustomProviderRows
      idPrefix="stt"
      providers={allSttProviders}
      hook={customProviderHook}
      form={<CreateEditProvider customProviderHook={customProviderHook} />}
    />
  );
};
