import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import type { EmulatorControllerClient } from "./types.js";

interface EmulatorControllerConstructor {
  new (target: string, credentials: grpc.ChannelCredentials): EmulatorControllerClient;
}

interface LoadedEmulatorPackage {
  android: {
    emulation: {
      control: {
        EmulatorController: EmulatorControllerConstructor;
      };
    };
  };
}

export function createGrpcClient(params?: {
  target?: string;
  protoPath?: string;
}): EmulatorControllerClient {
  const target = params?.target ?? process.env.EMULATOR_GRPC ?? "emulator:8554";
  const protoPath = params?.protoPath ?? defaultProtoPath();
  const packageDefinition = protoLoader.loadSync(protoPath, {
    defaults: true,
    enums: String,
    includeDirs: [dirname(protoPath)],
    keepCase: true,
    longs: String,
    oneofs: true
  });
  const loaded = grpc.loadPackageDefinition(packageDefinition) as unknown as LoadedEmulatorPackage;
  const Controller = loaded.android.emulation.control.EmulatorController;

  return new Controller(target, grpc.credentials.createInsecure());
}

function defaultProtoPath(): string {
  if (process.env.EMULATOR_PROTO) {
    return process.env.EMULATOR_PROTO;
  }

  const currentFile = fileURLToPath(import.meta.url);
  return `${dirname(currentFile)}/../../proto/emulator_controller.proto`;
}
