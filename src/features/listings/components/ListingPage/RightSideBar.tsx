import { ExternalLinkIcon, WarningIcon } from '@chakra-ui/icons';
import {
  Box,
  Flex,
  Image,
  Link,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import axios from 'axios';
import { usePostHog } from 'posthog-js/react';
import { useEffect, useState } from 'react';
import Countdown from 'react-countdown';

import { CountDownRenderer } from '@/components/shared/countdownRenderer';
import { tokenList } from '@/constants/index';
import { dayjs } from '@/utils/dayjs';
import { formatNumberWithSuffix } from '@/utils/formatNumberWithSuffix';
import { getURLSanitized } from '@/utils/getURLSanitized';
import { cleanRewards, nthLabelGenerator, rankLabels } from '@/utils/rank';

import type { Listing } from '../../types';
import { SubmissionActionButton } from '../Submission/SubmissionActionButton';
import { CompensationAmount } from './CompensationAmount';

export function RightSideBar({ listing }: { listing: Listing }) {
  const {
    id,
    token,
    type,
    deadline,
    rewards,
    rewardAmount,
    compensationType,
    maxRewardAsk,
    minRewardAsk,
    requirements,
    pocSocials,
    Hackathon,
    applicationType,
    timeToComplete,
  } = listing;

  const posthog = usePostHog();

  const [isSubmissionNumberLoading, setIsSubmissionNumberLoading] =
    useState(true);
  const [submissionNumber, setSubmissionNumber] = useState(0);
  const [submissionRange, setSubmissionRange] = useState('');

  const hasHackathonStarted = Hackathon?.startDate
    ? dayjs().isAfter(Hackathon.startDate)
    : true;

  const getSubmissionsCount = async () => {
    setIsSubmissionNumberLoading(true);
    try {
      const submissionCountDetails = await axios.get(
        `/api/listings/${id}/submission-count/`,
      );
      const count = submissionCountDetails?.data || 0;
      setSubmissionNumber(count);
      if (count >= 0 && count <= 10) {
        setSubmissionRange('0-10');
      } else if (count > 10 && count <= 25) {
        setSubmissionRange('10-25');
      } else if (count > 25 && count <= 50) {
        setSubmissionRange('25-50');
      } else if (count > 50 && count <= 100) {
        setSubmissionRange('50-100');
      } else if (count > 100) {
        setSubmissionRange('100+');
      }
      setIsSubmissionNumberLoading(false);
    } catch (e) {
      setIsSubmissionNumberLoading(false);
    }
  };

  useEffect(() => {
    if (!isSubmissionNumberLoading) return;
    getSubmissionsCount();
  }, []);

  const isProject = type === 'project';

  const rewardLength = cleanRewards(rewards).length;

  const prizeMapping = rankLabels
    .map((r, i) => ({
      key: i,
      label: nthLabelGenerator(i),
      description: `${r} Prize`,
    }))
    .slice(1, rewardLength + 1);
  // first item of rankLabels is ZERO, therefore slice from index 1

  return (
    <Box w={{ base: 'full', md: 'auto' }}>
      <VStack gap={2} pt={10}>
        <VStack
          justify={'center'}
          gap={0}
          w={{ base: 'full', md: '22rem' }}
          bg={'#FFFFFF'}
          rounded={'xl'}
        >
          <VStack
            justify={'space-between'}
            w={'full'}
            borderBottom={'1px solid #E2E8EF'}
          >
            <TableContainer w={'full'}>
              {compensationType !== 'fixed' && (
                <Text
                  mb={1}
                  px={6}
                  pt={3}
                  color="brand.slate.400"
                  fontSize={'xs'}
                  fontWeight={500}
                >
                  {compensationType === 'range' && 'Budget'}
                  {compensationType === 'variable' && 'Payment in'}
                </Text>
              )}
              <Table
                mt={compensationType === 'fixed' ? -6 : -10}
                variant={'unstyled'}
              >
                <Thead>
                  <Tr>
                    <Th></Th>
                    <Th></Th>
                    <Th> </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  <Tr w={'full'} h={16} borderBottom={'1px solid #E2E8EF'}>
                    <Td colSpan={2}>
                      <Flex align="center" gap={2}>
                        <Image
                          w={8}
                          h={8}
                          alt={'green doller'}
                          rounded={'full'}
                          src={
                            tokenList.filter((e) => e?.tokenSymbol === token)[0]
                              ?.icon ?? '/assets/icons/green-dollar.svg'
                          }
                        />
                        <CompensationAmount
                          compensationType={compensationType}
                          rewardAmount={rewardAmount}
                          maxRewardAsk={maxRewardAsk}
                          minRewardAsk={minRewardAsk}
                          token={token}
                          textStyle={{
                            fontWeight: 500,
                            fontSize: { base: 'lg', md: '2xl' },
                            color: 'brand.slate.700',
                          }}
                        />
                      </Flex>
                    </Td>
                    <Td>
                      {!isProject && (
                        <Text
                          ml={-6}
                          color={'brand.slate.400'}
                          fontSize={'lg'}
                          fontWeight={400}
                        >
                          Total Prizes
                        </Text>
                      )}
                    </Td>
                  </Tr>
                  {!isProject && (
                    <>
                      {prizeMapping.map(
                        (prize, index) =>
                          rewards?.[prize.key] && (
                            <Tr key={index}>
                              <Td colSpan={2}>
                                <Flex align="center">
                                  <Flex
                                    align={'center'}
                                    justify={'center'}
                                    w={8}
                                    h={8}
                                    mr={3}
                                    color="brand.slate.500"
                                    fontSize={'0.7rem'}
                                    bg={'blackAlpha.100'}
                                    rounded={'full'}
                                  >
                                    {prize.label}
                                  </Flex>
                                  <Flex>
                                    <Text
                                      color={'brand.slate.500'}
                                      fontSize={'lg'}
                                      fontWeight={500}
                                    >
                                      {formatNumberWithSuffix(
                                        rewards[prize.key]!,
                                        2,
                                        true,
                                      )}
                                    </Text>
                                    <Text
                                      mt="1px"
                                      ml={1}
                                      color="brand.slate.400"
                                      fontWeight={400}
                                    >
                                      {token}
                                    </Text>
                                  </Flex>
                                </Flex>
                              </Td>
                              <Td>
                                <Text
                                  ml={-6}
                                  color={'brand.slate.400'}
                                  fontWeight={400}
                                >
                                  {prize.description}
                                </Text>
                              </Td>
                            </Tr>
                          ),
                      )}
                    </>
                  )}
                </Tbody>
              </Table>
            </TableContainer>
          </VStack>
          <Flex
            justify={'space-between'}
            w={'full'}
            px={5}
            py={!rewards ? 3 : 0}
          >
            {hasHackathonStarted ? (
              <>
                <Flex align={'start'} justify={'center'} direction={'column'}>
                  <Flex align={'center'} justify={'center'} gap={2}>
                    <Image
                      w={'1.4rem'}
                      mt={-1}
                      alt={'suit case'}
                      src={'/assets/icons/purple-suitcase.svg'}
                    />
                    <Text
                      color={'#000000'}
                      fontSize={{ base: 'lg', md: 'xl' }}
                      fontWeight={500}
                    >
                      {isSubmissionNumberLoading
                        ? '...'
                        : !isProject
                          ? submissionNumber.toLocaleString()
                          : submissionRange}
                    </Text>
                  </Flex>
                  <Text color={'#94A3B8'}>
                    {isProject
                      ? 'Applications'
                      : submissionNumber === 1
                        ? 'Submission'
                        : 'Submissions'}
                  </Text>
                </Flex>

                <Flex
                  align={'start'}
                  justify={'center'}
                  direction={'column'}
                  py={3}
                >
                  <Flex align={'start'} justify={'center'} gap={1}>
                    <Image
                      w={'1.4rem'}
                      mt={1}
                      alt={'suit case'}
                      src={'/assets/icons/purple-timer.svg'}
                    />
                    <VStack align={'start'} gap={0}>
                      <Text
                        color={'#000000'}
                        fontSize={{ base: 'lg', md: 'xl' }}
                        fontWeight={500}
                      >
                        {applicationType === 'fixed' ? (
                          <Countdown
                            date={deadline}
                            renderer={CountDownRenderer}
                            zeroPadDays={1}
                          />
                        ) : (
                          'Rolling'
                        )}
                      </Text>
                      <Text color={'#94A3B8'}>
                        {applicationType === 'fixed' ? 'Remaining' : 'Deadline'}
                      </Text>
                    </VStack>
                  </Flex>
                </Flex>
              </>
            ) : (
              <Flex
                align={'start'}
                justify={'center'}
                direction={'column'}
                py={3}
              >
                <Flex align={'start'} justify={'center'} gap={1}>
                  <Image
                    w={'1.4rem'}
                    mt={1}
                    alt={'suit case'}
                    src={'/assets/icons/purple-timer.svg'}
                  />
                  <VStack align={'start'} gap={0}>
                    <Text
                      color={'#000000'}
                      fontSize={{ base: 'lg', md: 'xl' }}
                      fontWeight={500}
                    >
                      <Countdown
                        date={Hackathon?.startDate}
                        renderer={CountDownRenderer}
                        zeroPadDays={1}
                      />
                    </Text>
                    <Text color={'#94A3B8'}>Until Submissions Open</Text>
                  </VStack>
                </Flex>
              </Flex>
            )}
          </Flex>

          <Box w="full" px={5}>
            {isProject && (
              <Flex align={'start'} direction={'column'} my={4}>
                <Text
                  color={'#000000'}
                  fontSize={{ base: 'lg', md: 'xl' }}
                  fontWeight={500}
                >
                  {timeToComplete}
                </Text>
                <Text color={'#94A3B8'}>Time to Complete</Text>
              </Flex>
            )}
            <SubmissionActionButton
              listing={listing}
              hasHackathonStarted={hasHackathonStarted}
              submissionNumber={submissionNumber}
              setSubmissionNumber={setSubmissionNumber}
            />
            {isProject && (
              <Flex gap="2" w="20rem" mt={-1} mb={4} p="3" bg={'#62F6FF10'}>
                <WarningIcon color="#1A7F86" />
                <Text color="#1A7F86" fontSize={'xs'} fontWeight={500}>
                  Don&apos;t start working just yet! Apply first, and then begin
                  working only once you&apos;ve been hired for the project.
                </Text>
              </Flex>
            )}
          </Box>
        </VStack>
        {Hackathon && (
          <VStack
            align={'start'}
            justify={'center'}
            w={{ base: 'full', md: '22rem' }}
            mt={4}
            p={6}
            bg={'#FFFFFF'}
            rounded={'xl'}
          >
            <Text
              h="100%"
              color={'brand.slate.400'}
              fontSize="1rem"
              fontWeight={500}
              textAlign="center"
            >
              {Hackathon.name.toUpperCase()} TRACK
            </Text>
            <Text color={'brand.slate.500'} fontSize="1rem">
              {Hackathon.description}
            </Text>
            <Link
              color={'brand.slate.500'}
              fontSize="1rem"
              fontWeight={500}
              href={`/${Hackathon.name.toLowerCase()}`}
              isExternal
            >
              View All Challenges
            </Link>
          </VStack>
        )}
        {requirements && (
          <VStack
            align="start"
            w={{ base: 'full', md: '22rem' }}
            mt={4}
            p={6}
            bg="white"
            rounded={'xl'}
          >
            <Text
              h="100%"
              color={'brand.slate.400'}
              fontSize="1rem"
              fontWeight={500}
              textAlign="center"
            >
              ELIGIBILITY
            </Text>
            <Text color={'brand.slate.500'}>{requirements}</Text>
          </VStack>
        )}
        {pocSocials && (
          <VStack
            align={'start'}
            justify={'center'}
            w={{ base: '100%', md: '22rem' }}
            mt={4}
            p={6}
            bg={'#FFFFFF'}
            rounded={'xl'}
          >
            <Text
              h="100%"
              color={'brand.slate.400'}
              fontSize="1rem"
              fontWeight={500}
              textAlign="center"
            >
              CONTACT
            </Text>
            <Text>
              <Link
                className="ph-no-capture"
                color={'#64768b'}
                fontSize="1rem"
                fontWeight={500}
                href={getURLSanitized(pocSocials)}
                isExternal
                onClick={() => posthog.capture('reach out_listing')}
              >
                Reach out
                <ExternalLinkIcon color={'#64768b'} mb={1} as="span" mx={1} />
              </Link>
              <Text as="span" color={'brand.slate.500'} fontSize="1rem">
                if you have any questions about this listing
              </Text>
            </Text>
          </VStack>
        )}
      </VStack>
    </Box>
  );
}
