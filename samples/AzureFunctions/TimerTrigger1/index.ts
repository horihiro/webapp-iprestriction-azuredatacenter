import { AzureFunction, Context } from "@azure/functions";
import { loginWithAppServiceMSI } from "@azure/ms-rest-nodeauth";
import { TokenClientCredentials } from "@azure/ms-rest-nodeauth/dist/lib/credentials/tokenClientCredentials";
import { updateIpRestriction, getAzureIpRanges, UpdateOptions, IpRangeByServiceTag } from '../../../dist/lib/index';

const timerTrigger: AzureFunction = async function (context: Context, myTimer: any): Promise<void> {
  const timeStamp = new Date().toISOString();

  if (myTimer.IsPastDue) {
    context.log('Timer function is running late!');
  }
  context.log('Timer trigger function ran!', timeStamp);

  const sitename: string = 'deno';
  const serviceTag: string = 'AzureCloud.eastasia';
  const subscriptionIds: string[] = ['19330910-cc1d-4514-9cdb-0979fc1d3486'];

  const ipRanges: IpRangeByServiceTag[] = (await getAzureIpRanges()).filter((ipRangesByTag) => {
    return ipRangesByTag.id === serviceTag;
  });

  const credential: TokenClientCredentials = await loginWithAppServiceMSI({
    msiEndpoint: process.env.MSI_ENDPOINT,
    msiSecret: process.env.MSI_SECRET
  })

  const updateOptions: UpdateOptions = {
    credential,
    subscriptionIds,
    sitename,
    ipRanges
  }
  const updatedIpRestrictions = await updateIpRestriction(updateOptions);
  context.log(JSON.stringify(updatedIpRestrictions, null, 2))
};

export default timerTrigger;
