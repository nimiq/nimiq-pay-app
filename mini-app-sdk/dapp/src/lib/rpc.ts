export type Account = {
    address: string;
    balance: number;
    type: 'basic' | 'vesting' | 'htlc' | 'staking';
}

export type Staker = {
    address: string;
    balance: number;
    delegation: string | null;
    inactiveBalance: number;
    inactiveFrom: number | null;
    retiredBalance: number;
}

export function getAccountByAddress(address: string): Promise<Account> {
    return rpc('getAccountByAddress', [ address ]);
}

export function getStakerByAddress(address: string): Promise<Staker> {
    return rpc('getStakerByAddress', [ address ]);
}

async function rpc<T>(method: string, params: any[]): Promise<T> {
    return fetch('https://rpc.testnet.nimiqwatch.com', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method,
            params,
        }),
    }).then(res => res.json()).then(res => {
        if (res.error) {
            throw new Error(res.error.data);
        }
        return res.result.data;
    });
}
