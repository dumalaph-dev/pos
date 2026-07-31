/**
 * Minimal Web Bluetooth + WebUSB typings (not included in lib.dom).
 * Only what src/lib/printer.ts uses.
 */
interface BluetoothCharacteristic {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue(data: Uint8Array): Promise<void>;
}
interface BluetoothService {
  getCharacteristics(): Promise<BluetoothCharacteristic[]>;
}
interface BluetoothRemoteGATTServer {
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BluetoothService>;
}
interface BluetoothDevice {
  gatt: BluetoothRemoteGATTServer | null;
}
interface Navigator {
  bluetooth?: {
    requestDevice(opts: {
      acceptAllDevices?: boolean;
      optionalServices?: string[];
      filters?: unknown[];
    }): Promise<BluetoothDevice>;
  };
}

interface USBEndpoint {
  endpointNumber: number;
  direction: "in" | "out";
}
interface USBAlternateInterface {
  endpoints: USBEndpoint[];
}
interface USBInterface {
  alternate: USBAlternateInterface;
}
interface USBDevice {
  configuration: { interfaces: USBInterface[] } | null;
  open(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  transferOut(endpoint: number, data: Uint8Array): Promise<unknown>;
}
interface Navigator {
  usb?: {
    requestDevice(opts: { filters: unknown[] }): Promise<USBDevice>;
  };
}
