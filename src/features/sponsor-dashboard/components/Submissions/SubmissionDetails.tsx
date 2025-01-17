import { ArrowForwardIcon, CopyIcon, ExternalLinkIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Flex,
  Link,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Select,
  Spinner,
  Tag,
  TagLabel,
  Text,
  Tooltip,
} from '@chakra-ui/react';
import { type SubmissionLabels } from '@prisma/client';
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import axios from 'axios';
import dynamic from 'next/dynamic';
import NextLink from 'next/link';
import { log } from 'next-axiom';
import { usePostHog } from 'posthog-js/react';
import React, { type Dispatch, type SetStateAction, useState } from 'react';
import { BsTwitterX } from 'react-icons/bs';
import {
  MdArrowDropDown,
  MdOutlineAccountBalanceWallet,
  MdOutlineMail,
} from 'react-icons/md';

import { EarnAvatar } from '@/components/shared/EarnAvatar';
import { tokenList } from '@/constants';
import type { Listing, Rewards } from '@/features/listings';
import type { SubmissionWithUser } from '@/interface/submission';
import { getURLSanitized } from '@/utils/getURLSanitized';
import { rankLabels } from '@/utils/rank';
import { truncatePublicKey } from '@/utils/truncatePublicKey';
import { truncateString } from '@/utils/truncateString';

import { labelMenuOptions } from '../../constants';
import { colorMap, isLink } from '../../utils';

interface Props {
  bounty: Listing | null;
  submissions: SubmissionWithUser[];
  setSubmissions: Dispatch<SetStateAction<SubmissionWithUser[]>>;
  selectedSubmission: SubmissionWithUser | undefined;
  setSelectedSubmission: Dispatch<
    SetStateAction<SubmissionWithUser | undefined>
  >;
  setTotalWinners: Dispatch<SetStateAction<number>>;
  rewards: number[];
  usedPositions: number[];
  setUsedPositions: Dispatch<SetStateAction<number[]>>;
  setTotalPaymentsMade: Dispatch<SetStateAction<number>>;
  isHackathonPage?: boolean;
}

export const SubmissionDetails = ({
  bounty,
  submissions,
  setSubmissions,
  selectedSubmission,
  setSelectedSubmission,
  setTotalWinners,
  rewards,
  usedPositions,
  setUsedPositions,
  setTotalPaymentsMade,
  isHackathonPage,
}: Props) => {
  const [isSelectingWinner, setIsSelectingWinner] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  const { connected, publicKey, sendTransaction } = useWallet();
  const posthog = usePostHog();

  const isProject = bounty?.type === 'project';
  const isHackathon = bounty?.type === 'hackathon';

  const DynamicWalletMultiButton = dynamic(
    async () =>
      (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
    { ssr: false },
  );

  const selectWinner = async (
    position: number,
    id: string | undefined,
    ask: number | undefined,
  ) => {
    if (!id) return;
    setIsSelectingWinner(true);
    try {
      await axios.post(`/api/sponsor-dashboard/submission/toggle-winner/`, {
        id,
        isWinner: !!position,
        winnerPosition: position || null,
        ask: ask,
      });

      const submissionIndex = submissions.findIndex((s) => s.id === id);
      if (submissionIndex >= 0) {
        const oldRank: number =
          Number(submissions[submissionIndex]?.winnerPosition) || 0;

        let newUsedPositions = [...usedPositions];
        if (oldRank && oldRank !== position) {
          newUsedPositions = newUsedPositions.filter((pos) => pos !== oldRank);
        }

        if (position && !newUsedPositions.includes(position)) {
          newUsedPositions.push(position);
        }
        setUsedPositions(newUsedPositions);

        const updatedSubmission: SubmissionWithUser = {
          ...(submissions[submissionIndex] as SubmissionWithUser),
          isWinner: !!position,
          winnerPosition: (position as keyof Rewards) || undefined,
        };
        const newSubmissions = [...submissions];
        newSubmissions[submissionIndex] = updatedSubmission;
        setSubmissions(newSubmissions);
        setSelectedSubmission(updatedSubmission);
        setTotalWinners(newUsedPositions.length);
      }
      setIsSelectingWinner(false);
    } catch (e) {
      setIsSelectingWinner(false);
    }
  };

  const { connection } = useConnection();

  const handlePayout = async ({
    id,
    token,
    amount,
    receiver,
  }: {
    id: string;
    token: string;
    amount: number;
    receiver: PublicKey;
  }) => {
    setIsPaying(true);
    try {
      const transaction = new Transaction();
      const tokenDetails = tokenList.find((e) => e.tokenSymbol === token);
      const tokenAddress = tokenDetails?.mintAddress as string;
      const power = tokenDetails?.decimals as number;

      const latestBlockHash = await connection.getLatestBlockhash();

      const senderATA = await getAssociatedTokenAddressSync(
        new PublicKey(tokenAddress),
        publicKey as PublicKey,
      );
      const receiverATA = await getAssociatedTokenAddressSync(
        new PublicKey(tokenAddress),
        receiver as PublicKey,
      );

      if (token === 'SOL') {
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: publicKey as PublicKey,
            toPubkey: receiver,
            lamports: LAMPORTS_PER_SOL * amount,
          }),
        );
      } else {
        const receiverATAExists = await connection.getAccountInfo(receiverATA);

        if (!receiverATAExists) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              publicKey as PublicKey,
              receiverATA,
              receiver,
              new PublicKey(tokenAddress),
            ),
          );
        }

        transaction.add(
          createTransferInstruction(
            senderATA,
            receiverATA,
            publicKey as PublicKey,
            amount * 10 ** power,
          ),
        );
      }

      const signature = await sendTransaction(transaction, connection);

      await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature,
      });

      await new Promise((resolve, reject) => {
        connection.onSignature(
          signature,
          async (res) => {
            if (res.err) {
              reject(new Error('Transaction failed'));
            } else {
              try {
                await axios.post(
                  `/api/sponsor-dashboard/submission/add-payment/`,
                  {
                    id,
                    isPaid: true,
                    paymentDetails: {
                      txId: signature,
                    },
                  },
                );

                const submissionIndex = submissions.findIndex(
                  (s) => s.id === id,
                );
                if (submissionIndex >= 0) {
                  const updatedSubmission: SubmissionWithUser = {
                    ...(submissions[submissionIndex] as SubmissionWithUser),
                    isPaid: true,
                    paymentDetails: {
                      txId: signature,
                    },
                  };
                  const newSubmissions = [...submissions];
                  newSubmissions[submissionIndex] = updatedSubmission;
                  setSubmissions(newSubmissions);
                  setSelectedSubmission(updatedSubmission);
                  setTotalPaymentsMade(
                    (prevTotalPaymentsMade: number) =>
                      prevTotalPaymentsMade + 1,
                  );
                }
                resolve(res);
              } catch (error) {
                reject(new Error('Payment record update failed'));
              }
            }
          },
          'confirmed',
        );
      });

      setIsPaying(false);
    } catch (error) {
      console.log(error);
      log.error('Sponsor unable to pay');
      setIsPaying(false);
    }
  };

  const selectLabel = async (
    label: SubmissionLabels,
    id: string | undefined,
  ) => {
    try {
      await axios.post(`/api/sponsor-dashboard/submission/update-label/`, {
        label,
        id,
      });
      const submissionIndex = submissions.findIndex((s) => s.id === id);
      if (submissionIndex >= 0) {
        const updatedSubmission: SubmissionWithUser = {
          ...(submissions[submissionIndex] as SubmissionWithUser),
          label,
        };
        const newSubmissions = [...submissions];
        newSubmissions[submissionIndex] = updatedSubmission;
        setSubmissions(newSubmissions);
        setSelectedSubmission(updatedSubmission);
      }
    } catch (e) {
      console.log(e);
    }
  };

  let bg, color;

  if (submissions.length > 0) {
    ({ bg, color } = colorMap[selectedSubmission?.label as SubmissionLabels]);
  }

  return (
    <>
      <Box
        w="150%"
        bg="white"
        borderColor="brand.slate.200"
        borderTopWidth="1px"
        borderRightWidth={'1px'}
        borderBottomWidth="1px"
        roundedRight={'xl'}
      >
        {submissions.length ? (
          <>
            <Box
              py={1}
              borderBottom={'1px'}
              borderBottomColor={'brand.slate.200'}
              bgColor={'white'}
            >
              <Flex
                align="center"
                justify={'space-between'}
                w="full"
                px={4}
                py={3}
              >
                <Flex align="center" gap={2} w="full">
                  <EarnAvatar
                    size="40px"
                    id={selectedSubmission?.user?.id}
                    avatar={selectedSubmission?.user?.photo || undefined}
                  />
                  <Box>
                    <Text
                      w="100%"
                      color="brand.slate.900"
                      fontSize="md"
                      fontWeight={500}
                      whiteSpace={'nowrap'}
                    >
                      {`${selectedSubmission?.user?.firstName}'s Submission`}
                    </Text>
                    <Link
                      as={NextLink}
                      w="100%"
                      color="brand.purple"
                      fontSize="xs"
                      fontWeight={500}
                      whiteSpace={'nowrap'}
                      href={`/t/${selectedSubmission?.user?.username}`}
                    >
                      View Profile <ArrowForwardIcon mb="0.5" />
                    </Link>
                  </Box>
                </Flex>
                <Flex
                  className="ph-no-capture"
                  align="center"
                  justify={'flex-end'}
                  gap={2}
                  w="full"
                >
                  {selectedSubmission?.isWinner &&
                    selectedSubmission?.winnerPosition &&
                    !selectedSubmission?.isPaid &&
                    (bounty?.isWinnersAnnounced ? (
                      <>
                        <div
                          className="ph-no-capture"
                          onClick={() => {
                            posthog.capture('connect wallet_payment');
                          }}
                        >
                          <DynamicWalletMultiButton
                            style={{
                              height: '40px',
                              fontWeight: 600,
                              fontFamily: 'Inter',
                              // maxWidth: '96px',
                              paddingRight: '16px',
                              paddingLeft: '16px',
                              fontSize: '12px',
                            }}
                          >
                            {connected
                              ? truncatePublicKey(publicKey?.toBase58(), 3)
                              : `Pay ${bounty?.token} ${
                                  bounty?.rewards?.[
                                    selectedSubmission?.winnerPosition as keyof Rewards
                                  ] || '0'
                                }`}
                          </DynamicWalletMultiButton>
                        </div>
                        {connected && (
                          <Button
                            className="ph-no-capture"
                            w="fit-content"
                            minW={'120px'}
                            mr={4}
                            isDisabled={!bounty?.isWinnersAnnounced}
                            isLoading={isPaying}
                            loadingText={'Paying...'}
                            onClick={async () => {
                              if (!selectedSubmission?.user.publicKey) {
                                console.error(
                                  'Public key is null, cannot proceed with payment',
                                );
                                return;
                              }
                              posthog.capture('pay winner_sponsor');
                              handlePayout({
                                id: selectedSubmission?.id as string,
                                token: bounty?.token as string,
                                amount: bounty?.rewards![
                                  selectedSubmission?.winnerPosition as keyof Rewards
                                ] as number,
                                receiver: new PublicKey(
                                  selectedSubmission.user.publicKey,
                                ),
                              });
                            }}
                            size="md"
                            variant="solid"
                          >
                            Pay {bounty?.token}{' '}
                            {!!bounty?.rewards &&
                              bounty?.rewards[
                                selectedSubmission?.winnerPosition as keyof Rewards
                              ]}
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Tooltip
                          bg={'brand.purple'}
                          hasArrow={true}
                          isDisabled={!!bounty?.isWinnersAnnounced}
                          label="You have to publish the results before you can pay out rewards!"
                          placement="top"
                        >
                          <Button
                            mr={4}
                            isDisabled={!bounty?.isWinnersAnnounced}
                            size="sm"
                            variant="solid"
                          >
                            Pay {bounty?.token}{' '}
                            {!!bounty?.rewards &&
                              bounty?.rewards[
                                selectedSubmission?.winnerPosition as keyof Rewards
                              ]}
                          </Button>
                        </Tooltip>
                      </>
                    ))}
                  {selectedSubmission?.isWinner &&
                    selectedSubmission?.winnerPosition &&
                    selectedSubmission?.isPaid && (
                      <Button
                        mr={4}
                        onClick={() => {
                          window.open(
                            `https://solscan.io/tx/${selectedSubmission?.paymentDetails?.txId}?cluster=${process.env.NEXT_PUBLIC_PAYMENT_CLUSTER}`,
                            '_blank',
                          );
                        }}
                        rightIcon={<ExternalLinkIcon />}
                        size="md"
                        variant="ghost"
                      >
                        View Payment Txn
                      </Button>
                    )}
                  {isSelectingWinner && (
                    <Spinner color="brand.slate.400" size="sm" />
                  )}
                  {!bounty?.isWinnersAnnounced && (
                    <Menu>
                      <MenuButton
                        as={Button}
                        color="brand.slate.500"
                        fontWeight={500}
                        textTransform="capitalize"
                        bg="transparent"
                        borderWidth={'1px'}
                        borderColor="brand.slate.300"
                        _hover={{ backgroundColor: 'transparent' }}
                        _active={{
                          backgroundColor: 'transparent',
                          borderWidth: '1px',
                        }}
                        _expanded={{ borderColor: 'brand.purple' }}
                        pointerEvents={
                          selectedSubmission?.isWinner ? 'none' : 'all'
                        }
                        isDisabled={selectedSubmission?.isWinner}
                        rightIcon={<MdArrowDropDown />}
                      >
                        <Tag px={3} py={1} bg={bg} rounded="full">
                          <TagLabel
                            w="full"
                            color={color}
                            fontSize={'13px'}
                            textAlign={'center'}
                            textTransform={'capitalize'}
                            whiteSpace={'nowrap'}
                          >
                            {selectedSubmission?.label || 'Select Option'}
                          </TagLabel>
                        </Tag>
                      </MenuButton>
                      <MenuList borderColor="brand.slate.300">
                        {labelMenuOptions.map((option) => (
                          <MenuItem
                            key={option.value}
                            _focus={{ bg: 'brand.slate.100' }}
                            onClick={() =>
                              selectLabel(
                                option.value as SubmissionLabels,
                                selectedSubmission?.id,
                              )
                            }
                          >
                            <Tag px={3} py={1} bg={option.bg} rounded="full">
                              <TagLabel
                                w="full"
                                color={option.color}
                                fontSize={'11px'}
                                textAlign={'center'}
                                textTransform={'capitalize'}
                                whiteSpace={'nowrap'}
                              >
                                {option.label}
                              </TagLabel>
                            </Tag>
                          </MenuItem>
                        ))}
                      </MenuList>
                    </Menu>
                  )}
                  {!bounty?.isWinnersAnnounced && (
                    <Tooltip
                      bg={'brand.purple'}
                      hasArrow={true}
                      isDisabled={!bounty?.isWinnersAnnounced}
                      label="You cannot change the winners once the results are published!"
                      placement="top"
                    >
                      <Select
                        minW={44}
                        maxW={44}
                        color="brand.slate.500"
                        fontWeight={500}
                        textTransform="capitalize"
                        borderColor="brand.slate.300"
                        _placeholder={{ color: 'brand.slate.300' }}
                        focusBorderColor="brand.purple"
                        icon={<MdArrowDropDown />}
                        isDisabled={
                          !!bounty?.isWinnersAnnounced || isHackathonPage
                        }
                        onChange={(e) =>
                          selectWinner(
                            Number(e.target.value),
                            selectedSubmission?.id,
                            selectedSubmission?.ask,
                          )
                        }
                        value={
                          selectedSubmission?.isWinner
                            ? selectedSubmission.winnerPosition || ''
                            : ''
                        }
                      >
                        <option>Select Winner</option>
                        {rewards.map((reward) => {
                          const isRewardUsed = usedPositions.includes(reward);
                          const isCurrentSubmissionReward =
                            Number(selectedSubmission?.winnerPosition) ===
                            reward;
                          return (
                            (!isRewardUsed || isCurrentSubmissionReward) && (
                              <option key={reward} value={reward}>
                                {isProject ? 'Winner' : rankLabels[reward]}
                              </option>
                            )
                          );
                        })}
                      </Select>
                    </Tooltip>
                  )}
                </Flex>
              </Flex>

              <Flex align="center" gap={5} px={5} py={2}>
                {selectedSubmission?.user?.email && (
                  <Flex align="center" justify="start" gap={2} fontSize="sm">
                    <MdOutlineMail color="#94A3B8" />
                    <Link
                      color="brand.slate.400"
                      href={`mailto:${selectedSubmission.user.email}`}
                      isExternal
                    >
                      {truncateString(selectedSubmission?.user?.email, 36)}
                    </Link>
                  </Flex>
                )}
                {selectedSubmission?.user?.publicKey && (
                  <Flex
                    align="center"
                    justify="start"
                    gap={2}
                    fontSize="sm"
                    whiteSpace={'nowrap'}
                  >
                    <MdOutlineAccountBalanceWallet color="#94A3B8" />
                    <Text color="brand.slate.400">
                      {truncatePublicKey(
                        selectedSubmission?.user?.publicKey,
                        3,
                      )}
                      <Tooltip label="Copy Wallet ID" placement="right">
                        <CopyIcon
                          cursor="pointer"
                          ml={1}
                          color="brand.slate.400"
                          onClick={() =>
                            navigator.clipboard.writeText(
                              selectedSubmission?.user?.publicKey || '',
                            )
                          }
                        />
                      </Tooltip>
                    </Text>
                  </Flex>
                )}
                {selectedSubmission?.user?.twitter && (
                  <Flex align="center" justify="start" gap={2} fontSize="sm">
                    <BsTwitterX color="#94A3B8" />

                    <Link
                      color="brand.slate.400"
                      href={getURLSanitized(
                        selectedSubmission?.user?.twitter?.replace(
                          'twitter.com',
                          'x.com',
                        ) || '#',
                      )}
                      isExternal
                    >
                      {truncateString(
                        selectedSubmission?.user?.twitter?.replace(
                          'twitter.com',
                          'x.com',
                        ) || '-',
                        36,
                      )}
                    </Link>
                  </Flex>
                )}
              </Flex>
            </Box>

            <Box
              overflowY={'scroll'}
              h={'32.6rem'}
              p={4}
              css={{
                '&::-webkit-scrollbar': {
                  width: '4px',
                },
                '&::-webkit-scrollbar-track': {
                  width: '6px',
                },
                '&::-webkit-scrollbar-thumb': {
                  background: '#e2e8f0',
                  borderRadius: '24px',
                },
              }}
            >
              {!isProject && (
                <>
                  <Box mb={4}>
                    <Text
                      mb={1}
                      color="brand.slate.400"
                      fontSize="xs"
                      fontWeight={600}
                      textTransform={'uppercase'}
                    >
                      Main Submission
                    </Text>
                    <Link
                      as={NextLink}
                      color="brand.purple"
                      href={getURLSanitized(selectedSubmission?.link || '#')}
                      isExternal
                    >
                      {selectedSubmission?.link
                        ? getURLSanitized(selectedSubmission?.link)
                        : '-'}
                    </Link>
                  </Box>
                  <Box mb={4}>
                    <Text
                      mb={1}
                      color="brand.slate.400"
                      fontSize="xs"
                      fontWeight={600}
                      textTransform={'uppercase'}
                    >
                      Tweet Link
                    </Text>
                    <Link
                      as={NextLink}
                      color="brand.purple"
                      href={selectedSubmission?.tweet || '#'}
                      isExternal
                    >
                      {selectedSubmission?.tweet
                        ? selectedSubmission?.tweet
                        : '-'}
                    </Link>
                  </Box>
                </>
              )}
              {bounty?.compensationType !== 'fixed' && (
                <Box mb={4}>
                  <Text
                    mb={1}
                    color="brand.slate.400"
                    fontSize="xs"
                    fontWeight={600}
                    textTransform={'uppercase'}
                  >
                    Ask
                  </Text>
                  <Text color="brand.slate.700">
                    {selectedSubmission?.ask?.toLocaleString()} {bounty?.token}
                  </Text>
                </Box>
              )}

              {(isProject || isHackathon) &&
                selectedSubmission?.eligibilityAnswers?.map(
                  (answer: any, answerIndex: number) => (
                    <Box key={answerIndex} mb={4}>
                      <Text
                        mb={1}
                        color="brand.slate.400"
                        fontSize="xs"
                        fontWeight={600}
                        textTransform={'uppercase'}
                      >
                        {answer.question}
                      </Text>
                      {isLink(answer.answer) ? (
                        <Link
                          as={NextLink}
                          color="brand.purple"
                          href={getURLSanitized(answer.answer || '#')}
                          isExternal
                        >
                          {answer.answer ? getURLSanitized(answer.answer) : '-'}
                        </Link>
                      ) : (
                        <Text color="brand.slate.700">
                          {answer.answer || '-'}
                        </Text>
                      )}
                    </Box>
                  ),
                )}
              <Box mb={4}>
                <Text
                  mb={1}
                  color="brand.slate.400"
                  fontSize="xs"
                  fontWeight={600}
                  textTransform={'uppercase'}
                >
                  Anything Else
                </Text>
                <Text color="brand.slate.700">
                  {selectedSubmission?.otherInfo || '-'}
                </Text>
              </Box>
            </Box>
          </>
        ) : (
          <Box p={3}>
            <Text color={'brand.slate.500'} fontSize={'xl'} fontWeight={500}>
              No submissions found
            </Text>
            <Text color={'brand.slate.400'} fontSize={'sm'}>
              Try a different search query
            </Text>
          </Box>
        )}
      </Box>
    </>
  );
};
