import { logCount } from "./npaserver";

export async function post(url: string, data: any): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    redirect: "follow",
    referrerPolicy: "no-referrer",
    body: new URLSearchParams(data).toString(),
  });
  logCount(url);
  return response.json(); // parses JSON response into native JavaScript objects
}

export async function get(url: string, data: any): Promise<any> {
  const response = await fetch(
    `${url}?npa&${new URLSearchParams(data).toString()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      redirect: "follow",
      referrerPolicy: "no-referrer",
    },
  );
  logCount(url);
  return response.json(); // parses JSON response into native JavaScript objects
}
