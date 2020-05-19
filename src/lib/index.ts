import { WebSiteManagementClient } from "@azure/arm-appservice";
import { IpRangeByServiceTag } from "./getAzureIpRanges";
import { Site, SiteConfig, IpSecurityRestriction, WebAppsCreateOrUpdateConfigurationResponse, WebAppsGetConfigurationResponse } from "@azure/arm-appservice/esm/models";
import { TokenClientCredentials } from "@azure/ms-rest-nodeauth/dist/lib/credentials/tokenClientCredentials";

export { IpRangeByServiceTag, getAzureIpRanges } from "./getAzureIpRanges";

export type UpdatePriority = {
  start: number;
  gap: number;
}
export type UpdateOptions = {
  sitename: string;
  slotname?: string;
  ipRanges?: IpRangeByServiceTag[];
  scmIpRanges?: IpRangeByServiceTag[];
  credential: TokenClientCredentials;
  subscriptionIds: string[];
  priority?: UpdatePriority;
}

const createIpSecurityRestrictions = (ipRanges: IpRangeByServiceTag[]) => {
  return ipRanges.reduce((prev: IpSecurityRestriction[], current: IpRangeByServiceTag) => {
    const ipSecurityRestrictions: IpSecurityRestriction[] = current.properties.addressPrefixes.map((addressPrefix: string) => {
      return {
        name: current.name,
        ipAddress: addressPrefix
      }
    });
    return prev.concat(ipSecurityRestrictions);
  }, []);
};

export async function updateIpRestriction(options: UpdateOptions): Promise<WebAppsGetConfigurationResponse> {

  const webapp:Site | null = await (async () => {
    try {
      return (await Promise.all(
        options.subscriptionIds.map(async (subscriptionId) => {
          const client = new WebSiteManagementClient(options.credential, subscriptionId);
          return await client.webApps.list();
        }))).filter((webapps) => {
          return webapps.filter(webapp => webapp.name?.toLowerCase() === options.sitename.toLowerCase()).length > 0;
        })[0][0];
    } catch (e) {
      return null;
    }
  })();
  if (!webapp) throw new Error(`Couldn't find such a site \`${options.sitename}\` in subscription(s) ${options.subscriptionIds.join(',')}`);
  const client = new WebSiteManagementClient(options.credential, webapp.id?.replace(/^\/subscriptions\/([^\/]+)\/.*$/, '$1') as string);

  const ipSecurityRestrictions: IpSecurityRestriction[] | undefined = options.ipRanges ? createIpSecurityRestrictions(options.ipRanges) : undefined;
  const scmIpSecurityRestrictions: IpSecurityRestriction[] | undefined = options.scmIpRanges ? createIpSecurityRestrictions(options.scmIpRanges) : undefined;
  const siteConfig: SiteConfig = {
    ipSecurityRestrictions,
    scmIpSecurityRestrictions
  };
  const response:WebAppsCreateOrUpdateConfigurationResponse = await client.webApps.createOrUpdateConfiguration(
    webapp.resourceGroup as string,
    webapp.name as string,
    siteConfig)
  return await client.webApps.getConfiguration(webapp.resourceGroup as string, webapp.name as string);
}

