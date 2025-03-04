import { SuiClient } from "@mysten/sui.js/client";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { getKeypair } from "../helpers/getKeyPair";
import { bytesToHex } from "@noble/hashes/utils";
import { bls12_381 } from "@noble/curves/bls12-381";
import { getBLSSecreyKey } from "../helpers/getBLSSecretKey";
import { getGameObject } from "../helpers/getGameObject";

interface DoInitialDealProps {
  suiClient: SuiClient;
  gameId: string;
  houseDataId: string;
}

// Not catching errors on purpose, they will be caught and logged by the corresponding route.ts file
export const doInitialDeal = async ({
  suiClient,
  gameId,
  houseDataId,
}: DoInitialDealProps): Promise<{ txDigest: string }> => {
  console.log("Doing initial deal as the house...");

  const adminKeypair = getKeypair(process.env.ADMIN_SECRET_KEY!);

  const tx = new TransactionBlock();
  return getGameObject({ suiClient, gameId }).then(async (resp) => {
    const { counter, user_randomness } = resp;
    const counterHex = bytesToHex(Uint8Array.from([counter]));
    const randomnessHexString = bytesToHex(Uint8Array.from(user_randomness));
    const messageToSign = randomnessHexString.concat(counterHex);
    let signedHouseHash = bls12_381.sign(
      messageToSign,
      getBLSSecreyKey(process.env.ADMIN_SECRET_KEY!)
    );
    tx.setGasBudget(10000000000);

    console.log({
      package: process.env.NEXT_PUBLIC_PACKAGE_ADDRESS,
      gameId,
      signedHouseHash,
      houseDataId,
    });

    tx.moveCall({
      target: `${process.env.NEXT_PUBLIC_PACKAGE_ADDRESS}::single_player_blackjack::first_deal`,
      arguments: [
        tx.object(gameId),
        tx.pure(Array.from(signedHouseHash), "vector<u8>"),
        tx.object(houseDataId),
      ],
    });

    return suiClient
      .signAndExecuteTransactionBlock({
        signer: adminKeypair,
        transactionBlock: tx,
        requestType: "WaitForLocalExecution",
        options: {
          showObjectChanges: true,
          showEffects: true,
        },
      })
      .then(async (res) => {
        const status = res?.effects?.status.status;
        if (status !== "success") {
          throw new Error("Transaction failed");
        }
        return { txDigest: res.effects?.transactionDigest! };
      });
  });
};
