import fetch from "node-fetch";

export type Properties = {
  changeNumber?: number;
  region?: string;
  platform?: string;
  systemService?: string;
  addressPrefixes: string[];
}

export type IpRangeByServiceTag = {
  name: string;
  id: string;
  properties: Properties;
}

export async function getAzureIpRanges(url?: string): Promise<IpRangeByServiceTag[]> {
  const downloadPageUrl: string = url || 'https://www.microsoft.com/en-us/download/confirmation.aspx?id=56519';
  const jsonUrl: string = (await (await fetch(downloadPageUrl)).text()).replace(/^[\s\S]*click here.+ href="([^"]+)"[\s\S]*$/, "$1");
  if (!/^https:\/\/.*\.json/.test(jsonUrl)) throw new Error('Couldn\'t get JSON url.');

  return (await (await fetch(jsonUrl)).json()).values as IpRangeByServiceTag[];
}