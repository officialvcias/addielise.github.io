import type { UserValidateEvent } from '@netlify/functions';

export default {
    userValidate(event: UserValidateEvent) {
        if (!event.user.invitedAt) return event.deny();
    },
};
