import { Elysia, t, type LocalHook } from 'elysia'

import { lucia, type Auth, type Configuration } from 'lucia'

import {
    auth0,
    apple,
    azureAD,
    bitbucket,
    box,
    cognito,
    discord,
    dropbox,
    facebook,
    github,
    gitlab,
    google,
    lichess,
    line,
    linkedIn,
    osu,
    patreon,
    reddit,
    salesforce,
    slack,
    spotify,
    strava,
    twitch,
    twitter
} from '@lucia-auth/oauth/providers'

import {
    createOAuth,
    createOAuthWithPKCE,
    InvalidSession,
    type Prettify
} from './utils'

import type { CookieOptions } from 'elysia/dist/cookie'

export const Lucia = <
    const Name extends string = 'user',
    const SessionName extends string = 'session'
>(
    configuration: Prettify<
        {
            name?: Name
            session?: SessionName
        } & Omit<Configuration, 'env'> & {
                env?: Configuration['env']
                cookie?: Parameters<typeof t.Cookie>[1]
            }
    >
) => {
    const auth = lucia({
        ...configuration,
        env:
            (process.env.ENV ?? process.env.NODE_ENV) === 'production'
                ? 'PROD'
                : 'DEV'
    })

    const name: Name = configuration.name ?? ('user' as Name)
    const sessionName: SessionName =
        configuration.session ?? ('session' as SessionName)

    const elysia = new Elysia({
        name: '@elysiajs/lucia-auth',
        seed: configuration
    })
        .error({
            INVALID_SESSION: InvalidSession
        })
        .derive(async ({ cookie }) => {
            const session = cookie[sessionName]

            const decorators = {
                auth,
                get id() {
                    try {
                        return auth
                            .getSession(session.value)
                            .then(({ user: { userId } }) => userId)
                    } catch {
                        throw new InvalidSession()
                    }
                },
                get data() {
                    return decorators.id.then(async (id) => auth.getUser(id))
                },
                async signUp(
                    {
                        username,
                        password,
                        ...rest
                    }: {
                        username: string
                        password: string
                    } & {
                        [attributes in string]: unknown
                    },
                    {
                        createSession = false
                    }: {
                        /**
                         * @default false
                         */
                        createSession: boolean
                    } = {
                        createSession: false
                    }
                ) {
                    const data = await auth.createUser({
                        key: {
                            providerId: 'username',
                            providerUserId: username,
                            password
                        },
                        attributes: {
                            username,
                            ...rest
                        }
                    })

                    if (createSession)
                        await decorators.signIn(username, password)

                    return data
                },
                async signIn(username: string, password: string) {
                    const { userId } = await auth.useKey(
                        'username',
                        username,
                        password
                    )

                    const { sessionId } = await auth.createSession({
                        userId,
                        attributes: {}
                    })

                    session.value = sessionId
                    session.set({
                        httpOnly: true,
                        maxAge: 3600,
                        path: '/'
                    })
                },
                async updateUser(
                    // @ts-ignore
                    attributes: Lucia.DatabaseUserAttributes
                ) {
                    auth.updateUserAttributes(await decorators.id, attributes)
                },
                async updatePassword(username: string, password: string) {
                    const { userId } = await auth.updateKeyPassword(
                        'username',
                        username,
                        password
                    )

                    const { sessionId } = await auth.createSession({
                        userId,
                        attributes: {}
                    })

                    session.value = sessionId
                },
                async refresh() {
                    const { userId: id, sessionId } = await auth.createSession({
                        userId: await decorators.id,
                        sessionId: session.value,
                        attributes: {}
                    })

                    session.value = sessionId
                },
                async signOut(type?: 'all' | 'unused' | 'current') {
                    if (!type) await auth.invalidateSession(session.value)
                    else
                        switch (type) {
                            case 'all':
                                await auth.invalidateAllUserSessions(
                                    session.value
                                )
                                break

                            case 'current':
                                await auth.invalidateSession(session.value)
                                break

                            case 'unused':
                                await auth.deleteDeadUserSessions(session.value)
                                break
                        }

                    session.remove()
                },
                async delete({
                    confirm
                }: {
                    confirm: 'DELETE ALL USER DATA and is not reversible'
                }) {
                    await Promise.all([
                        auth.deleteUser(await decorators.id),
                        auth.invalidateAllUserSessions(session.value)
                    ])

                    session.remove()
                },
                async validate() {
                    if (!session.value) throw new InvalidSession()

                    try {
                        await auth.validateSession(session.value)
                    } catch {
                        throw new InvalidSession()
                    }
                }
            } as const

            return {
                [name as Name]: decorators
            } as Record<Name, typeof decorators>
        })

    return {
        lucia: auth,
        elysia,
        oauth: {
            auth0: createOAuth(
                auth,
                auth0,
                'auth0',
                sessionName,
                ({ email, sub }) => ({
                    id: sub,
                    username: email
                })
            ),
            apple: createOAuth(
                auth,
                apple,
                'apple',
                sessionName,
                ({ email, sub }) => ({
                    id: sub,
                    username: email
                })
            ),
            azure: createOAuthWithPKCE(
                auth,
                azureAD,
                'azureAD',
                sessionName,
                ({ email, sub }) => ({
                    id: sub,
                    username: email
                })
            ),
            box: createOAuth(auth, box, 'box', sessionName, ({ id, name }) => ({
                id,
                username: name
            })),
            discord: createOAuth(
                auth,
                discord,
                'discord',
                sessionName,
                ({ id, username }) => ({
                    id,
                    username
                })
            ),
            dropbox: createOAuth(
                auth,
                dropbox,
                'dropbox',
                sessionName,
                ({ email, name }) => ({
                    id: email,
                    username: name
                })
            ),
            facebook: createOAuth(
                auth,
                facebook,
                'facebook',
                sessionName,
                ({ id, name }) => ({
                    id,
                    username: name
                })
            ),
            github: createOAuth(
                auth,
                github,
                'github',
                sessionName,
                ({ id, login }) => ({
                    id: id.toString(),
                    username: login
                })
            ),
            gitlab: createOAuth(
                auth,
                gitlab,
                'gitlab',
                sessionName,
                ({ id, name }) => ({
                    id: id.toString(),
                    username: name
                })
            ),
            google: createOAuth(
                auth,
                google,
                'google',
                sessionName,
                ({ sub, name }) => ({
                    id: sub,
                    username: name
                })
            ),
            lichless: createOAuthWithPKCE(
                auth,
                lichess,
                'lichess',
                sessionName,
                ({ id, username }) => ({
                    id,
                    username
                })
            ),
            line: createOAuth(
                auth,
                line,
                'line',
                sessionName,
                ({ userId, displayName }) => ({
                    id: userId,
                    username: displayName
                })
            ),
            linkedIn: createOAuth(
                auth,
                linkedIn,
                'linkedIn',
                sessionName,
                ({ name, email }) => ({
                    id: email,
                    username: name
                })
            ),
            osu: createOAuth(
                auth,
                osu,
                'osu',
                sessionName,
                ({ id, username }) => ({
                    id: id.toString(),
                    username
                })
            ),
            patreon: createOAuth(
                auth,
                patreon,
                'patreon',
                sessionName,
                ({ id, attributes: { full_name } }) => ({
                    id,
                    username: full_name
                })
            ),
            reddit: createOAuth(
                auth,
                reddit,
                'reddit',
                sessionName,
                ({ id, name }) => ({
                    id,
                    username: name
                })
            ),
            salesforce: createOAuth(
                auth,
                salesforce,
                'salesforce',
                sessionName,
                ({ user_id, name }) => ({
                    id: user_id,
                    username: name
                })
            ),
            slack: createOAuth(
                auth,
                slack,
                'slack',
                sessionName,
                ({ sub, name }) => ({
                    id: sub,
                    username: name
                })
            ),
            spotify: createOAuth(
                auth,
                spotify,
                'spotify',
                sessionName,
                ({ id, display_name }) => ({
                    id: id,
                    username: display_name
                })
            ),
            twitch: createOAuth(
                auth,
                twitch,
                'twitch',
                sessionName,
                ({ id, display_name }) => ({
                    id,
                    username: display_name
                })
            ),
            twitter: createOAuthWithPKCE(
                auth,
                twitter,
                'twitter',
                sessionName,
                ({ id, name }) => ({
                    id: id,
                    username: name
                })
            )
        }
    }
}

export default Lucia