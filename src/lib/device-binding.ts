export const POS_DEVICE_BINDING_KEY = "pos.device.binding.v1";

export type PosDeviceBinding = {
  deviceId: string;
  storeId: string;
  devicePrefix: string;
  boundAt: string;
};
