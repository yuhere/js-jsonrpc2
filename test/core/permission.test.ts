import { describe, it, expect } from 'vitest';
import { checkPermission } from '../../src/core/permission';
import { buildDescriptor } from '../../src/core/descriptor';
import { PERMISSION_DENIED } from '../../src/errors/codes';
import { s } from '../../src/schema/json';

describe('checkPermission', () => {

    const descriptor = buildDescriptor(
        {
            namespace: 'secret',
            grantTo: ['admin'],
            signature: [s.string()],
        },
        () => 'ok',
    );

    it('allows when no grantTo', async () => {
        const open = buildDescriptor(
            { namespace: 'open', signature: [s.string()] },
            () => 'ok',
        );
        await expect(checkPermission(open, {})).resolves.toBeUndefined();
    });

    it('denies when perm_check returns false', async () => {
        await expect(
            checkPermission(descriptor, { perm_check: async () => false }),
        ).rejects.toMatchObject({ code: PERMISSION_DENIED });
    });

    it('allows when perm_check returns true', async () => {
        await expect(
            checkPermission(descriptor, { perm_check: async () => true }),
        ).resolves.toBeUndefined();
    });

    it("describe alone does not emit empty constraints", () => {
        const described = s.string().describe("only desc");
        expect(described.toJSON()).toEqual({
            kind: "string",
            description: "only desc",
        });
        expect(described.toJSON()).not.toHaveProperty("constraints");
    });

});